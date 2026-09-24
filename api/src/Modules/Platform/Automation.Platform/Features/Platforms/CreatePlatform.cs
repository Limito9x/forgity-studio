using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Platform.Constants;
using Automation.Platform.Features.PlatformExtensions;
using Automation.Platform.Infrastructure.Persistence;
using Automation.Platform.Shared.Dtos;

namespace Automation.Platform.Features.Platforms;

public record CreatePlatformCommand(
    string Key,
    string Name,
    List<string>? Extensions = null,
    Guid? IconAssetId = null
);

public class CreatePlatformValidator : Validator<CreatePlatformCommand>
{
    public CreatePlatformValidator()
    {
        RuleFor(x => x.Key)
            .NotEmpty().WithMessage("Platform Key is required.")
            .MaximumLength(100);

        RuleFor(x => x.Name)
            .NotEmpty().WithMessage("Platform Name is required.")
            .MaximumLength(100);
    }
}

public class CreatePlatformEndpoint(IMessageBus bus) : Endpoint<CreatePlatformCommand, PlatformDto>
{
    public override void Configure()
    {
        Post("/");
        Group<PlatformsGroup>();
        Permissions(P.Platform.Create);
    }

    public override async Task HandleAsync(CreatePlatformCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<PlatformDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PlatformDbContext))]
public class CreatePlatformHandler(PlatformDbContext db, IAssetApi assetApi)
{
    public async Task<Result<PlatformDto>> HandleAsync(CreatePlatformCommand command, CancellationToken ct)
    {
        var keyExists = await db.Platforms.AnyAsync(x => x.Key == command.Key, ct);
        if (keyExists)
            return Result.Fail($"Platform with Key '{command.Key}' already exists.");

        var platform = new Domain.Entities.Platform(command.Key, command.Name);

        if (command.Extensions is not null && command.Extensions.Count > 0)
        {
            var extensionEntities = await CreateExtensionsHandler.EnsureExtensionsExistAsync(db, command.Extensions, ct);
            platform.SetExtensions(extensionEntities);
        }

        db.Platforms.Add(platform);
        await db.SaveChangesAsync(ct);

        string? iconUrl = null;
        if (command.IconAssetId.HasValue && command.IconAssetId.Value != Guid.Empty)
        {
            var linkResult = await assetApi.VerifyAndLinkAsync(
                command.IconAssetId.Value,
                "Platform",
                PlatformAssetSlots.Icon,
                platform.Id.ToString(),
                "icon",
                0,
                ct
            );

            if (linkResult.IsSuccess)
            {
                var filesRes = await assetApi.GetFilesAsync(platform.Id.ToString(), "Platform", PlatformAssetSlots.Icon, ct);
                if (filesRes.IsSuccess)
                {
                    iconUrl = filesRes.Value.FirstOrDefault()?.PublicUrl;
                }
            }
        }

        var dto = new PlatformDto(
            platform.Id,
            platform.Key,
            platform.Name,
            platform.Extensions.Select(x => x.Extension).ToList(),
            platform.CreatedAt,
            command.IconAssetId,
            iconUrl
        );

        return Result.Ok(dto);
    }
}
