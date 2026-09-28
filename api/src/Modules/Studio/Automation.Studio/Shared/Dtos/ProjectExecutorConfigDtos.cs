using System.Text.Json;

namespace Automation.Studio.Shared.Dtos;

public record ProjectExecutorConfigDto(
    Guid Id,
    Guid ProjectId,
    Guid RunnerId,
    string ExecutorKey,
    JsonDocument? Settings,
    DateTimeOffset CreatedAt,
    DateTimeOffset? UpdatedAt
);

public record UpsertProjectExecutorConfigDto(
    Guid ProjectId,
    Guid RunnerId,
    string ExecutorKey,
    JsonDocument? Settings
);
