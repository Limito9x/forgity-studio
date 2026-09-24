using Automation.Workspace.Domain.Entities;
using Automation.Workspace.Infrastructure.Persistence;
using Automation.Workspace.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.RepositoryRunners;

public record AttachRunnerToRepositoryCommand(
    Guid RepositoryId,
    Guid RunnerId,
    string RootPath
);

public class AttachRunnerToRepositoryValidator : AbstractValidator<AttachRunnerToRepositoryCommand>
{
    public AttachRunnerToRepositoryValidator()
    {
        RuleFor(x => x.RepositoryId).NotEmpty();
        RuleFor(x => x.RunnerId).NotEmpty();
        RuleFor(x => x.RootPath).NotEmpty().MaximumLength(500);
    }
}

public class AttachRunnerToRepositoryEndpoint(IMessageBus bus)
    : Endpoint<AttachRunnerToRepositoryCommand, RepositoryRunnerDto>
{
    public override void Configure()
    {
        Post("");
        Group<RepositoryRunnersGroup>();
        Permissions(P.RepositoryRunner.Create);
    }

    public override async Task HandleAsync(AttachRunnerToRepositoryCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<RepositoryRunnerDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(WorkspaceDbContext))]
public class AttachRunnerToRepositoryHandler(WorkspaceDbContext db)
{
    public async Task<Result<RepositoryRunnerDto>> HandleAsync(AttachRunnerToRepositoryCommand command, CancellationToken ct)
    {
        var repo = await db.Repositories.FindAsync([command.RepositoryId], ct);
        if (repo is null)
            return Result.Fail($"Repository with ID '{command.RepositoryId}' was not found.");

        var existingRunner = await db.RepositoryRunners
            .FirstOrDefaultAsync(x => x.RepositoryId == command.RepositoryId && x.RunnerId == command.RunnerId, ct);

        if (existingRunner is not null)
        {
            existingRunner.UpdateRootPath(command.RootPath);
            await db.SaveChangesAsync(ct);
            return Result.Ok(existingRunner.Adapt<RepositoryRunnerDto>());
        }

        var repositoryRunner = new RepositoryRunner(
            command.RepositoryId,
            command.RunnerId,
            command.RootPath
        );

        db.RepositoryRunners.Add(repositoryRunner);
        await db.SaveChangesAsync(ct);

        return Result.Ok(repositoryRunner.Adapt<RepositoryRunnerDto>());
    }
}
