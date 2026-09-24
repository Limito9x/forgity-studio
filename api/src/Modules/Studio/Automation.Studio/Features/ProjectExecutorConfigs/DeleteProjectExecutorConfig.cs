using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Studio.Features.Projects;
using Automation.Studio.Infrastructure.Persistence;

namespace Automation.Studio.Features.ProjectExecutorConfigs;

public record DeleteProjectExecutorConfigCommand(Guid ProjectId, Guid Id);

public class DeleteProjectExecutorConfigEndpoint(IMessageBus bus)
    : Endpoint<DeleteProjectExecutorConfigCommand>
{
    public override void Configure()
    {
        Delete("{ProjectId:guid}/executor-configs/{Id:guid}");
        Group<ProjectsGroup>();
        Permissions(P.Project.Delete);
        Description(x => x.WithName("DeleteProjectExecutorConfig"));
    }

    public override async Task HandleAsync(
        DeleteProjectExecutorConfigCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(StudioDbContext))]
public class DeleteProjectExecutorConfigHandler(StudioDbContext db)
{
    public async Task<Result> HandleAsync(
        DeleteProjectExecutorConfigCommand command,
        CancellationToken ct)
    {
        var config = await db.ProjectExecutorConfigs
            .FirstOrDefaultAsync(x => x.Id == command.Id && x.ProjectId == command.ProjectId, ct);

        if (config == null)
        {
            return Result.Fail($"ProjectExecutorConfig with ID {command.Id} not found in project {command.ProjectId}.");
        }

        db.ProjectExecutorConfigs.Remove(config);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
