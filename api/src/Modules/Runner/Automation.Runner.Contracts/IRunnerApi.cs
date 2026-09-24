using FluentResults;

namespace Automation.Runner.Contracts;

public interface IRunnerApi
{
    Task<Result<RunnerDto>> GetRunnerByIdAsync(Guid runnerId, CancellationToken ct = default);
    Task<Result<IReadOnlyList<RunnerDto>>> GetRunnersByIdsAsync(
        IEnumerable<Guid> runnerIds,
        CancellationToken ct = default
    );
    Task<Result<IReadOnlyDictionary<Guid, RunnerDto>>> GetRunnersMapByIdsAsync(
        IEnumerable<Guid> runnerIds,
        CancellationToken ct = default
    );
    Task<Result<RunnerScanResultDto>> SendScanCommandAsync(
        Guid runnerId,
        string directoryPath,
        IEnumerable<string>? extensions = null,
        CancellationToken ct = default
    );
    Task<Result<RunnerBrowseResultDto>> SendBrowseCommandAsync(
        Guid runnerId,
        string directoryPath,
        CancellationToken ct = default
    );
    Task<Result<IReadOnlyList<ExecutorCandidateDto>>> SendScanExecutorsCommandAsync(
        Guid runnerId,
        string? executorKey = null,
        CancellationToken ct = default
    );
    Task<Result<List<RunnerInfo>>> GetRunnerInfoByIds(
        IReadOnlyList<Guid> runnerIds,
        CancellationToken ct = default
    );
    Task<Result<List<RunnerDto>>> GetAvailableRunnersByUserId(
        Guid userId,
        CancellationToken ct = default
    );
    Task<Result<IReadOnlyList<RunnerDto>>> GetRunnersByStudioIdAsync(
        Guid studioId,
        CancellationToken ct = default
    );

    // Compatibility methods for previous IAgentApi callers
    Task<Result<RunnerDto>> GetAgentByIdAsync(Guid agentId, CancellationToken ct = default)
        => GetRunnerByIdAsync(agentId, ct);
    Task<Result<IReadOnlyList<RunnerDto>>> GetAgentsByIdsAsync(
        IEnumerable<Guid> agentIds,
        CancellationToken ct = default
    ) => GetRunnersByIdsAsync(agentIds, ct);
    Task<Result<IReadOnlyDictionary<Guid, RunnerDto>>> GetAgentsMapByIdsAsync(
        IEnumerable<Guid> agentIds,
        CancellationToken ct = default
    ) => GetRunnersMapByIdsAsync(agentIds, ct);
    Task<Result<List<RunnerInfo>>> GetAgentInfoByIds(
        IReadOnlyList<Guid> agentIds,
        CancellationToken ct = default
    ) => GetRunnerInfoByIds(agentIds, ct);
    Task<Result<List<RunnerDto>>> GetAvailableAgentsByUserId(
        Guid userId,
        CancellationToken ct = default
    ) => GetAvailableRunnersByUserId(userId, ct);
}

// Backward-compatibility alias
public interface IAgentApi : IRunnerApi
{
}
