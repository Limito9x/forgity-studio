using Automation.Runner.Domain.Entities;
using Automation.Runner.Infrastructure.Persistence;
using Automation.Runner.Shared.Dtos;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Runner.Features.Runners;

public record AttachRunnerToStudioRequest(Guid StudioId, string? Alias = null);

public record AttachRunnerToStudioCommand(Guid RunnerId, Guid StudioId, string? Alias = null);

public class AttachRunnerToStudioValidator : AbstractValidator<AttachRunnerToStudioCommand>
{
    public AttachRunnerToStudioValidator()
    {
        RuleFor(x => x.RunnerId).NotEmpty();
        RuleFor(x => x.StudioId).NotEmpty();
        RuleFor(x => x.Alias).MaximumLength(150);
    }
}

public class AttachRunnerToStudioEndpoint(IMessageBus bus)
    : Endpoint<AttachRunnerToStudioRequest, RunnerStudioDto>
{
    public override void Configure()
    {
        Post("{runnerId:guid}/studios");
        Group<RunnersGroup>();
        Permissions(P.Runner.Update);
    }

    public override async Task HandleAsync(AttachRunnerToStudioRequest req, CancellationToken ct)
    {
        var runnerId = Route<Guid>("runnerId");
        var command = new AttachRunnerToStudioCommand(runnerId, req.StudioId, req.Alias);
        var result = await bus.InvokeAsync<Result<RunnerStudioDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(RunnerDbContext))]
public class AttachRunnerToStudioHandler(RunnerDbContext db)
{
    public async Task<Result<RunnerStudioDto>> HandleAsync(AttachRunnerToStudioCommand command, CancellationToken ct)
    {
        var runnerExists = await db.Runners.AnyAsync(r => r.Id == command.RunnerId, ct);
        if (!runnerExists)
            return Result.Fail($"Runner with ID '{command.RunnerId}' was not found.");

        var existing = await db.RunnerStudios
            .FirstOrDefaultAsync(rs => rs.RunnerId == command.RunnerId && rs.StudioId == command.StudioId, ct);

        if (existing is not null)
        {
            if (command.Alias != null)
                existing.Alias = command.Alias;
            existing.IsApproved = true;
            await db.SaveChangesAsync(ct);
            return Result.Ok(existing.Adapt<RunnerStudioDto>());
        }

        var link = new RunnerStudio
        {
            RunnerId = command.RunnerId,
            StudioId = command.StudioId,
            Alias = command.Alias,
            IsApproved = true
        };

        db.RunnerStudios.Add(link);
        await db.SaveChangesAsync(ct);

        return Result.Ok(link.Adapt<RunnerStudioDto>());
    }
}
