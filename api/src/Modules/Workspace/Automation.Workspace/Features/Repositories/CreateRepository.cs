using Automation.Workspace.Domain.Entities;
using Automation.Workspace.Infrastructure.Persistence;
using Automation.Workspace.Shared.Dtos;
using Wolverine.Attributes;

namespace Automation.Workspace.Features.Repositories;

public record CreateRepositoryCommand(
    Guid ProjectId,
    string Name,
    string? Description = null
);

public class CreateRepositoryValidator : AbstractValidator<CreateRepositoryCommand>
{
    public CreateRepositoryValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class CreateRepositoryEndpoint(IMessageBus bus)
    : Endpoint<CreateRepositoryCommand, RepositoryDto>
{
    public override void Configure()
    {
        Post("");
        Group<RepositoriesGroup>();
        Permissions(P.Repository.Create);
    }

    public override async Task HandleAsync(CreateRepositoryCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<RepositoryDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(WorkspaceDbContext))]
public class CreateRepositoryHandler(WorkspaceDbContext db)
{
    public async Task<Result<RepositoryDto>> HandleAsync(CreateRepositoryCommand command, CancellationToken ct)
    {
        var repo = new Repository(command.ProjectId, command.Name, command.Description);
        db.Repositories.Add(repo);
        await db.SaveChangesAsync(ct);

        var dto = new RepositoryDto(
            repo.Id,
            repo.ProjectId,
            repo.Name,
            repo.Description,
            0,
            0,
            repo.CreatedAt
        );

        return Result.Ok(dto);
    }
}
