namespace Automation.Runner.Contracts;

public record RunnerDto(
    Guid Id,
    string Name,
    string MachineKey,
    bool IsActive,
    DateTimeOffset? LastSeenAt,
    DateTimeOffset CreatedAt
);

// Backward-compatibility alias
public record AgentDto(
    Guid Id,
    string Name,
    string MachineKey,
    bool IsActive,
    DateTimeOffset? LastSeenAt,
    DateTimeOffset CreatedAt
) : RunnerDto(Id, Name, MachineKey, IsActive, LastSeenAt, CreatedAt);
