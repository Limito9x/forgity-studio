namespace Automation.Runner.Contracts;

public record RunnerDto(
    Guid Id,
    string Name,
    string MachineKey,
    bool IsActive,
    DateTimeOffset? LastSeenAt,
    DateTimeOffset CreatedAt,
    bool IsOnline = false,
    string? OsPlatform = null,
    string? CpuModel = null,
    long? TotalRamBytes = null,
    string? PrimaryGpuName = null,
    long? PrimaryGpuVramBytes = null,
    DateTimeOffset? LastHardwareScannedAt = null,
    RunnerHardwareProfile? HardwareDetails = null,
    IReadOnlyList<RunnerExecutorConfigDto>? ExecutorConfigs = null,
    string? AppVersion = null
);

// Backward-compatibility alias
public record AgentDto(
    Guid Id,
    string Name,
    string MachineKey,
    bool IsActive,
    DateTimeOffset? LastSeenAt,
    DateTimeOffset CreatedAt,
    bool IsOnline = false,
    string? OsPlatform = null,
    string? CpuModel = null,
    long? TotalRamBytes = null,
    string? PrimaryGpuName = null,
    long? PrimaryGpuVramBytes = null,
    DateTimeOffset? LastHardwareScannedAt = null,
    RunnerHardwareProfile? HardwareDetails = null,
    IReadOnlyList<RunnerExecutorConfigDto>? ExecutorConfigs = null,
    string? AppVersion = null
) : RunnerDto(
    Id,
    Name,
    MachineKey,
    IsActive,
    LastSeenAt,
    CreatedAt,
    IsOnline,
    OsPlatform,
    CpuModel,
    TotalRamBytes,
    PrimaryGpuName,
    PrimaryGpuVramBytes,
    LastHardwareScannedAt,
    HardwareDetails,
    ExecutorConfigs,
    AppVersion
);
