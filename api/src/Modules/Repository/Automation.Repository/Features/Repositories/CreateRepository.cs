using Automation.Repository.Domain.Entities;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Repository.Shared.Dtos;
using Wolverine.Attributes;

namespace Automation.Repository.Features.Repositories;

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
        Description(x => x.WithName("CreateRepository"));
    }

    public override async Task HandleAsync(CreateRepositoryCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<RepositoryDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RepositoryDbContext))]
public class CreateRepositoryHandler(RepositoryDbContext db)
{
    public async Task<Result<RepositoryDto>> HandleAsync(CreateRepositoryCommand command, CancellationToken ct)
    {
        var repo = new Domain.Entities.Repository(command.ProjectId, command.Name, command.Description);
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
