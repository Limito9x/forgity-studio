namespace Automation.Studio.Shared.Dtos;

public record StudioDto(
    Guid Id,
    string Name,
    string Slug,
    string? Description,
    DateTimeOffset CreatedAt
);
