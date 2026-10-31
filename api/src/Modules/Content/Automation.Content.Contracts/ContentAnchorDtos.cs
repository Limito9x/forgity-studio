namespace Automation.Content.Contracts;

public record ResourceSmartLinkInput(
    Guid ResourceId,
    string FileName,
    string? RelativePath = null,
    string? ExplicitAnchorPath = null,
    string? MetadataJson = null
);

public record ContentAnchorLinkDto(
    Guid Id,
    Guid ContentItemId,
    string ContentItemName,
    string AnchorPath,
    int TargetType, // 0 = Resource, 1 = ContentItem, 2 = Asset
    Guid TargetId,
    string? TargetName,
    string? MetadataJson
);

public record ContentAnchorNodeDto(
    string Name,
    string FullPath,
    bool IsLeaf,
    Guid? TargetId,
    int? TargetType,
    string? TargetName,
    string? MetadataJson,
    List<ContentAnchorNodeDto> Children
);

public record ContentAnchorTreeDto(
    Guid ContentItemId,
    string ContentItemName,
    List<ContentAnchorNodeDto> Roots
);

