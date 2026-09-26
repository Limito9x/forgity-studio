using Automation.Runner.Domain.Entities;

namespace Automation.Runner.Shared.Dtos;

public record RunnerDto(
    Guid Id,
    string Name,
    string MachineKey,
    bool IsActive,
    DateTimeOffset? LastSeenAt,
    DateTimeOffset CreatedAt,
    string? OsPlatform = null,
    string? CpuModel = null,
    long? TotalRamBytes = null,
    string? PrimaryGpuName = null,
    long? PrimaryGpuVramBytes = null,
    DateTimeOffset? LastHardwareScannedAt = null,
    RunnerHardwareProfile? HardwareDetails = null,
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

public record RunnerStudioDto(
    Guid Id,
    Guid RunnerId,
    Guid StudioId,
    string? Alias,
    bool IsApproved,
    DateTimeOffset CreatedAt,
    RunnerDto? Runner = null
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
) : RunnerDto(Id, Name, MachineKey, IsActive, LastSeenAt, CreatedAt, ExecutorConfigs: ExecutorConfigs);

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
