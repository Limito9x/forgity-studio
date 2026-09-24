using Automation.Workspace.Infrastructure.Persistence;
using Automation.Workspace.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.Repositories;

public record UpdateRepositoryRequest(string Name, string? Description = null);

public record UpdateRepositoryCommand(Guid Id, string Name, string? Description = null);

public class UpdateRepositoryValidator : AbstractValidator<UpdateRepositoryCommand>
{
    public UpdateRepositoryValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class UpdateRepositoryEndpoint(IMessageBus bus)
    : Endpoint<UpdateRepositoryRequest, RepositoryDto>
{
    public override void Configure()
    {
        Put("{id:guid}");
        Group<RepositoriesGroup>();
        Permissions(P.Repository.Update);
    }

    public override async Task HandleAsync(UpdateRepositoryRequest req, CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var command = new UpdateRepositoryCommand(id, req.Name, req.Description);
        var result = await bus.InvokeAsync<Result<RepositoryDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(WorkspaceDbContext))]
public class UpdateRepositoryHandler(WorkspaceDbContext db)
{
    public async Task<Result<RepositoryDto>> HandleAsync(UpdateRepositoryCommand command, CancellationToken ct)
    {
        var repo = await db.Repositories
            .Include(r => r.RepositoryRunners)
            .Include(r => r.Resources)
            .FirstOrDefaultAsync(r => r.Id == command.Id, ct);

        if (repo is null)
            return Result.Fail($"Repository with ID '{command.Id}' was not found.");

        repo.Update(command.Name, command.Description);
        await db.SaveChangesAsync(ct);

        var dto = new RepositoryDto(
            repo.Id,
            repo.ProjectId,
            repo.Name,
            repo.Description,
            repo.RepositoryRunners.Count,
            repo.Resources.Count,
            repo.CreatedAt
        );

        return Result.Ok(dto);
    }
}
