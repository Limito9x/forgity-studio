using Wolverine.Attributes;
using Automation.Platform.Infrastructure.Persistence;

namespace Automation.Platform.Features.Platforms;

public record DeletePlatformCommand(Guid Id);

public class DeletePlatformEndpoint(IMessageBus bus) : EndpointWithoutRequest
{
    public override void Configure()
    {
        Delete("/{id:guid}");
        Group<PlatformsGroup>();
        Permissions(P.Platform.Delete);
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result>(new DeletePlatformCommand(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PlatformDbContext))]
public class DeletePlatformHandler(PlatformDbContext db)
{
    public async Task<Result> HandleAsync(DeletePlatformCommand command, CancellationToken ct)
    {
        var platform = await db.Platforms.FindAsync([command.Id], ct);
        if (platform is null)
            return Result.Fail($"Platform with ID '{command.Id}' was not found.");

        db.Platforms.Remove(platform);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
