global using Automation.Runner.Contracts;

namespace Automation.Runner.Shared.Dtos;

public record RabbitMqConfigDto(
    string Host,
    int Port,
    string Username,
    string Password,
    string VirtualHost
);

public record RegisterRunnerResultDto(
    Guid Id,
    string Name,
    string MachineKey,
    string RegistrationToken,
    RabbitMqConfigDto? RabbitMq = null
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
public record RegisterAgentResultDto(
    Guid Id,
    string Name,
    string MachineKey,
    string RegistrationToken
) : RegisterRunnerResultDto(Id, Name, MachineKey, RegistrationToken);
