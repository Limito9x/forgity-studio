using System.Text.Json;
using Automation.Tag.Contracts.Dtos;

namespace Automation.Repository.Contracts.Dtos;

public record ResourceMetadataDetailDto(
    Guid ResourceVersionId,
    JsonDocument? Metadata,
    Dictionary<string, IReadOnlyList<TagLinkDetailDto>> TagMap
);

public record ResourceBatchItemDto(
    Guid ResourceId,
    Guid ResourceVersionId,
    string Name,
    string? RelativePath,
    string? FullLocalPath,
    JsonDocument? Metadata,
    IReadOnlyList<TagLinkDetailDto> ResourceTags,
    Dictionary<string, IReadOnlyList<TagLinkDetailDto>> TagMap
);

public record UpdatedTagLink(
    Guid TagId,
    string JsonPath
);

