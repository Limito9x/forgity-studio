namespace Automation.Projects.Shared.Dtos;

public record StudioDto(
    Guid Id,
    string Name,
    string Slug,
    string? Description,
    DateTimeOffset CreatedAt
);

public record StudioRunnerDto(
    Guid Id,
    Guid StudioId,
    Guid RunnerId,
    string? Alias,
    bool IsApproved,
    DateTimeOffset CreatedAt
);
