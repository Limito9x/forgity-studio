using Automation.Repository.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Repository.Features.RepositoryRunners;

public record DetachRunnerFromRepositoryRequest
{
    public Guid RepositoryId { get; init; }
    public Guid RunnerId { get; init; }
}

public record DetachRunnerFromRepositoryCommand(
    Guid RepositoryId,
    Guid RunnerId
);

public class DetachRunnerFromRepositoryValidator : AbstractValidator<DetachRunnerFromRepositoryRequest>
{
    public DetachRunnerFromRepositoryValidator()
    {
        RuleFor(x => x.RepositoryId).NotEmpty();
        RuleFor(x => x.RunnerId).NotEmpty();
    }
}

public class DetachRunnerFromRepositoryEndpoint(IMessageBus bus)
    : Endpoint<DetachRunnerFromRepositoryRequest>
{
    public override void Configure()
    {
        Delete("{repositoryId:guid}/{runnerId:guid}");
        Group<RepositoryRunnersGroup>();
        Permissions(P.RepositoryRunner.Delete);
        Description(x => x
            .WithName("DetachRunnerFromRepository")
            .Produces(200)
            .ProducesProblemFE(400)
            .ProducesProblemFE(404));
    }

    public override async Task HandleAsync(DetachRunnerFromRepositoryRequest req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result>(
            new DetachRunnerFromRepositoryCommand(req.RepositoryId, req.RunnerId),
            ct
        );
        await this.SendResultAsync(result, ct);
    }
}

/// <summary>
/// Handler xử lý ngắt liên kết (Detach) giữa Runner và Repository.
/// 
/// [Thứ tự xử lý]:
/// 1. Kiểm tra tồn tại quan hệ RepositoryRunner (Existence Check).
/// 2. Guard 1: Kiểm tra runner có đang giữ active file lock trong repo không (Lock Check).
/// 3. Xóa RepositoryRunner và commit (Cascade delete tự động unbind ResourceVersionLocations, file cục bộ giữ nguyên vẹn).
/// 
/// [Test Cases dựng kèm]:
/// - DetachRunner_WhenRunnerNotAttached_ReturnsFailure
/// - DetachRunner_WhenRunnerHoldsActiveLock_ReturnsFailureAndBlocks
/// - DetachRunner_WhenCleanAndIdle_SucceedsAndRemovesRepositoryRunner
/// </summary>
[Transactional(typeof(RepositoryDbContext))]
public class DetachRunnerFromRepositoryHandler(RepositoryDbContext db)
{
    public async Task<Result> HandleAsync(DetachRunnerFromRepositoryCommand command, CancellationToken ct)
    {
        var repoRunner = await db.RepositoryRunners
            .FirstOrDefaultAsync(x => x.RepositoryId == command.RepositoryId && x.RunnerId == command.RunnerId, ct);

        if (repoRunner is null)
            return Result.Fail($"Runner '{command.RunnerId}' is not attached to Repository '{command.RepositoryId}'.");

        // 1. Guard check: Check if runner is currently holding active file locks in this repository
        var hasActiveLocks = await db.ResourceItems
            .AnyAsync(x => x.RepositoryId == command.RepositoryId && x.LockedByRunnerId == command.RunnerId, ct);

        if (hasActiveLocks)
        {
            return Result.Fail("Cannot detach runner because it is currently holding active file locks in this repository. Please release or check in locked files first.");
        }

        // 2. Remove RepositoryRunner (cascade delete cleans up ResourceVersionLocations while local files remain intact)
        db.RepositoryRunners.Remove(repoRunner);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}
