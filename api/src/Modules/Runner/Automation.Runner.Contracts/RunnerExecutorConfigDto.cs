using System.Text.Json;

namespace Automation.Runner.Contracts;

public record RunnerExecutorConfigDto(
    Guid Id,
    Guid RunnerId,
    string ExecutorKey,
    string ExecutablePath,
    string? Version,
    bool IsEnabled,
    JsonDocument? Settings,
    DateTimeOffset CreatedAt
);

public record RunnerInfo(
    Guid Id,
    string Name,
    bool IsAvailable,
    List<RunnerExecutorConfigInfo> ExecutorConfigs
);

public record RunnerExecutorConfigInfo(
    string Key,
    string ExecutablePath,
    string? Version,
    bool IsEnabled = true,
    JsonDocument? Settings = null
);

// Backward-compatibility aliases
public record AgentExecutorConfigDto(
    Guid Id,
    Guid AgentId,
    string ExecutorKey,
    string ExecutablePath,
    string? Version,
    bool IsEnabled,
    JsonDocument? Settings,
    DateTimeOffset CreatedAt
) : RunnerExecutorConfigDto(Id, AgentId, ExecutorKey, ExecutablePath, Version, IsEnabled, Settings, CreatedAt);

public record AgentInfo(
    Guid Id,
    string Name,
    bool IsAvailable,
    List<AgentExecutorConfigInfo> ExecutorConfigs
);

public record AgentExecutorConfigInfo(
    string Key,
    string ExecutablePath,
    string? Version,
    bool IsEnabled = true,
    JsonDocument? Settings = null
);
