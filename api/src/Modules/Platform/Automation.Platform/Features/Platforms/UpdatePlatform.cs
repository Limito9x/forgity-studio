using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Platform.Constants;
using Automation.Platform.Features.PlatformExtensions;
using Automation.Platform.Infrastructure.Persistence;
using Automation.Platform.Shared.Dtos;

namespace Automation.Platform.Features.Platforms;

public record UpdatePlatformCommand(Guid Id, string Name, List<string>? Extensions = null, Guid? IconAssetId = null);

public class UpdatePlatformRequest
{
    public string Name { get; set; } = string.Empty;
    public List<string>? Extensions { get; set; }
    public Guid? IconAssetId { get; set; }
}

public class UpdatePlatformValidator : Validator<UpdatePlatformCommand>
{
    public UpdatePlatformValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
    }
}

public class UpdatePlatformEndpoint(IMessageBus bus) : Endpoint<UpdatePlatformRequest, PlatformDto>
{
    public override void Configure()
    {
        Put("/{id:guid}");
        Group<PlatformsGroup>();
        Permissions(P.Platform.Update);
    }

    public override async Task HandleAsync(UpdatePlatformRequest req, CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<PlatformDto>>(new UpdatePlatformCommand(id, req.Name, req.Extensions, req.IconAssetId), ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PlatformDbContext))]
public class UpdatePlatformHandler(PlatformDbContext db, IAssetApi assetApi)
{
    public async Task<Result<PlatformDto>> HandleAsync(UpdatePlatformCommand command, CancellationToken ct)
    {
        var platform = await db.Platforms
            .Include(x => x.Extensions)
            .FirstOrDefaultAsync(x => x.Id == command.Id, ct);

        if (platform is null)
            return Result.Fail($"Platform with ID '{command.Id}' was not found.");

        platform.Update(command.Name);

        if (command.Extensions is not null)
        {
            var extensionEntities = await CreateExtensionsHandler.EnsureExtensionsExistAsync(db, command.Extensions, ct);
            platform.SetExtensions(extensionEntities);
        }

        await db.SaveChangesAsync(ct);

        Guid? currentIconAssetId = command.IconAssetId;
        if (command.IconAssetId.HasValue && command.IconAssetId.Value != Guid.Empty)
        {
            await assetApi.VerifyAndLinkAsync(
                command.IconAssetId.Value,
                "Platform",
                PlatformAssetSlots.Icon,
                platform.Id.ToString(),
                "icon",
                0,
                ct
            );
        }

        string? iconUrl = null;
        var filesRes = await assetApi.GetFilesAsync(platform.Id.ToString(), "Platform", PlatformAssetSlots.Icon, ct);
        if (filesRes.IsSuccess)
        {
            var firstFile = filesRes.Value.FirstOrDefault();
            iconUrl = firstFile?.PublicUrl;
            if (!currentIconAssetId.HasValue && firstFile != null)
            {
                currentIconAssetId = firstFile.AssetId;
            }
        }

        var dto = new PlatformDto(
            platform.Id,
            platform.Key,
            platform.Name,
            platform.Extensions.Select(x => x.Extension).ToList(),
            platform.CreatedAt,
            currentIconAssetId,
            iconUrl
        );

        return Result.Ok(dto);
    }
}
