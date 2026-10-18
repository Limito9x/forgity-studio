using Automation.Repository.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Repository.Features.RepositoryRunners;

public record GetAttachedRepositoriesByRunnerRequest
{
    public Guid RunnerId { get; init; }
}

public record AttachedRepositoryDto(
    Guid RepositoryId,
    string RepositoryName,
    Guid ProjectId,
    string MountPath,
    DateTimeOffset AttachedAt,
    int ActiveLocksCount
);

public record GetAttachedRepositoriesByRunnerQuery(Guid RunnerId);

public class GetAttachedRepositoriesByRunnerValidator : AbstractValidator<GetAttachedRepositoriesByRunnerRequest>
{
    public GetAttachedRepositoriesByRunnerValidator()
    {
        RuleFor(x => x.RunnerId).NotEmpty();
    }
}

public class GetAttachedRepositoriesByRunnerEndpoint(IMessageBus bus)
    : Endpoint<GetAttachedRepositoriesByRunnerRequest, IReadOnlyList<AttachedRepositoryDto>>
{
    public override void Configure()
    {
        Get("by-runner/{runnerId:guid}");
        Group<RepositoryRunnersGroup>();
        Permissions(P.RepositoryRunner.GetAll);
        Description(x => x
            .WithName("GetAttachedRepositoriesByRunner")
            .Produces<IReadOnlyList<AttachedRepositoryDto>>(200)
            .ProducesProblemFE(400));
    }

    public override async Task HandleAsync(GetAttachedRepositoriesByRunnerRequest req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<AttachedRepositoryDto>>>(
            new GetAttachedRepositoriesByRunnerQuery(req.RunnerId),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

public class GetAttachedRepositoriesByRunnerHandler(RepositoryDbContext db)
{
    public async Task<Result<IReadOnlyList<AttachedRepositoryDto>>> HandleAsync(
        GetAttachedRepositoriesByRunnerQuery query,
        CancellationToken ct
    )
    {
        var attachments = (await db.RepositoryRunners
            .AsNoTracking()
            .Where(rr => rr.RunnerId == query.RunnerId)
            .Include(rr => rr.Repository)
            .ToListAsync(ct))
            .OrderByDescending(rr => rr.CreatedAt)
            .ToList();

        if (attachments.Count == 0)
        {
            return Result.Ok<IReadOnlyList<AttachedRepositoryDto>>([]);
        }

        var repositoryIds = attachments.Select(a => a.RepositoryId).Distinct().ToList();

        // Count active file locks held by this runner per repository
        var lockCounts = await db.ResourceItems
            .AsNoTracking()
            .Where(r => repositoryIds.Contains(r.RepositoryId) && r.LockedByRunnerId == query.RunnerId)
            .GroupBy(r => r.RepositoryId)
            .Select(g => new { RepositoryId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.RepositoryId, x => x.Count, ct);

        var result = attachments.Select(a => new AttachedRepositoryDto(
            RepositoryId: a.RepositoryId,
            RepositoryName: a.Repository?.Name ?? "Unknown Repository",
            ProjectId: a.Repository?.ProjectId ?? Guid.Empty,
            MountPath: a.RootPath,
            AttachedAt: a.CreatedAt,
            ActiveLocksCount: lockCounts.GetValueOrDefault(a.RepositoryId, 0)
        )).ToList();

        return Result.Ok<IReadOnlyList<AttachedRepositoryDto>>(result);
    }
}
