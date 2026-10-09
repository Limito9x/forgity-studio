namespace Automation.Content.Shared.Dtos;

public record ContentLookupDto(
    Guid Id,
    string Name,
    string Key,
    Guid ContentTypeId,
    string ContentTypeKey,
    string ContentTypeName,
    string? ContentTypeColor,
    string? ContentTypeIcon
);
