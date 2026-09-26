using Microsoft.EntityFrameworkCore;
using Automation.Platform.Infrastructure.Persistence;
using Automation.Platform.Shared.Dtos;

namespace Automation.Platform.Features.PlatformExtensions;

public record CreateExtensionCommand(string Extension);

public class CreateExtensionValidator : Validator<CreateExtensionCommand>
{
    public CreateExtensionValidator()
    {
        RuleFor(x => x.Extension)
            .NotEmpty()
            .MaximumLength(50);
    }
}

public class CreateExtensionEndpoint(IMessageBus bus) : Endpoint<CreateExtensionCommand, PlatformExtensionDto>
{
    public override void Configure()
    {
        Post("/");
        Group<PlatformExtensionsGroup>();
        Permissions(P.PlatformExtension.Create);
    }

    public override async Task HandleAsync(CreateExtensionCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<PlatformExtensionDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class CreateExtensionHandler(PlatformDbContext db)
{
    public async Task<Result<PlatformExtensionDto>> HandleAsync(CreateExtensionCommand command, CancellationToken ct)
    {
        var extensionClean = command.Extension.Trim().TrimStart('.').ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(extensionClean))
            return Result.Fail("Extension cannot be empty.");

        var exists = await db.PlatformExtensions.AnyAsync(
            x => x.Extension == extensionClean || x.Extension == "." + extensionClean, ct);

        if (exists)
            return Result.Fail($"Extension '{extensionClean}' already exists.");

        var ext = new Domain.Entities.PlatformExtension(extensionClean);
        db.PlatformExtensions.Add(ext);
        await db.SaveChangesAsync(ct);

        return Result.Ok(ext.Adapt<PlatformExtensionDto>());
    }
}
