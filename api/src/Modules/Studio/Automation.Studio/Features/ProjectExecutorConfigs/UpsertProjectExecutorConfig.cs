using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Studio.Domain.Entities;
using Automation.Studio.Features.Projects;
using Automation.Studio.Infrastructure.Persistence;
using Automation.Studio.Shared.Dtos;

namespace Automation.Studio.Features.ProjectExecutorConfigs;

public record UpsertProjectExecutorConfigCommand(
    Guid ProjectId,
    Guid AgentId,
    string ExecutorKey,
    JsonDocument? Settings
);

public class UpsertProjectExecutorConfigValidator : AbstractValidator<UpsertProjectExecutorConfigCommand>
{
    public UpsertProjectExecutorConfigValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.AgentId).NotEmpty();
        RuleFor(x => x.ExecutorKey).NotEmpty().MaximumLength(50);
    }
}

public class UpsertProjectExecutorConfigEndpoint(IMessageBus bus)
    : Endpoint<UpsertProjectExecutorConfigCommand, ProjectExecutorConfigDto>
{
    public override void Configure()
    {
        Post("{ProjectId:guid}/executor-configs");
        Group<ProjectsGroup>();
        Permissions(P.Project.Update);
        Description(x => x.WithName("UpsertProjectExecutorConfig"));
    }

    public override async Task HandleAsync(
        UpsertProjectExecutorConfigCommand req,
        CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ProjectExecutorConfigDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(StudioDbContext))]
public class UpsertProjectExecutorConfigHandler(StudioDbContext db)
{
    public async Task<Result<ProjectExecutorConfigDto>> HandleAsync(
        UpsertProjectExecutorConfigCommand command,
        CancellationToken ct)
    {
        var projectExists = await db.Projects.AnyAsync(x => x.Id == command.ProjectId, ct);
        if (!projectExists)
        {
            return Result.Fail<ProjectExecutorConfigDto>($"Project with ID {command.ProjectId} not found.");
        }

        var config = await db.ProjectExecutorConfigs
            .FirstOrDefaultAsync(x => x.ProjectId == command.ProjectId &&
                                      x.AgentId == command.AgentId &&
                                      x.ExecutorKey == command.ExecutorKey, ct);

        if (config == null)
        {
            config = new ProjectExecutorConfig(
                command.ProjectId,
                command.AgentId,
                command.ExecutorKey,
                command.Settings
            );
            db.ProjectExecutorConfigs.Add(config);
        }
        else
        {
            config.Update(command.Settings);
        }

        await db.SaveChangesAsync(ct);

        return Result.Ok(new ProjectExecutorConfigDto(
            config.Id,
            config.ProjectId,
            config.AgentId,
            config.ExecutorKey,
            config.Settings,
            config.CreatedAt,
            config.UpdatedAt
        ));
    }
}
