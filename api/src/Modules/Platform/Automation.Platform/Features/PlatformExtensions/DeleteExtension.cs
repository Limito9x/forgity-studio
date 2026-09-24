using Automation.Platform.Infrastructure.Persistence;

namespace Automation.Platform.Features.PlatformExtensions;

public record DeleteExtensionCommand(Guid Id);

public class DeleteExtensionEndpoint(IMessageBus bus) : EndpointWithoutRequest
{
    public override void Configure()
    {
        Delete("/{id:guid}");
        Group<PlatformExtensionsGroup>();
        Permissions(P.PlatformExtension.Delete);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result>(new DeleteExtensionCommand(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

public class DeleteExtensionHandler(PlatformDbContext db)
{
    public async Task<Result> HandleAsync(DeleteExtensionCommand command, CancellationToken ct)
    {
        var ext = await db.PlatformExtensions.FindAsync([command.Id], ct);
        if (ext is null)
            return Result.Fail($"PlatformExtension with ID '{command.Id}' was not found.");

        db.PlatformExtensions.Remove(ext);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
