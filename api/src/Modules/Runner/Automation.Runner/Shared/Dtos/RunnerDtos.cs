namespace Automation.Runner.Shared.Dtos;

public record RunnerDto(
    Guid Id,
    string Name,
    string MachineKey,
    bool IsActive,
    DateTimeOffset? LastSeenAt,
    DateTimeOffset CreatedAt,
    IReadOnlyList<RunnerExecutorConfigDto>? ExecutorConfigs = null
);

public record RegisterRunnerResultDto(
    Guid Id,
    string Name,
    string MachineKey,
    string RegistrationToken
);

public record RunnerExecutorConfigDto(
    Guid Id,
    Guid RunnerId,
    string ExecutorKey,
    string ExecutablePath,
    string? Version,
    DateTimeOffset CreatedAt
);

// Backward-compatibility aliases
public record AgentDto(
    Guid Id,
    string Name,
    string MachineKey,
    bool IsActive,
    DateTimeOffset? LastSeenAt,
    DateTimeOffset CreatedAt,
    IReadOnlyList<RunnerExecutorConfigDto>? ExecutorConfigs = null
) : RunnerDto(Id, Name, MachineKey, IsActive, LastSeenAt, CreatedAt, ExecutorConfigs);

public record RegisterAgentResultDto(
    Guid Id,
    string Name,
    string MachineKey,
    string RegistrationToken
) : RegisterRunnerResultDto(Id, Name, MachineKey, RegistrationToken);

public record AgentExecutorConfigDto(
    Guid Id,
    Guid RunnerId,
    string ExecutorKey,
    string ExecutablePath,
    string? Version,
    DateTimeOffset CreatedAt
) : RunnerExecutorConfigDto(Id, RunnerId, ExecutorKey, ExecutablePath, Version, CreatedAt);
