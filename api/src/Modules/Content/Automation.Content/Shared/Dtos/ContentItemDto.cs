using System.Text.Json;

namespace Automation.Content.Shared.Dtos;

public record ContentItemDto
{
    public required Guid Id { get; set; }
    public Guid ContentTypeId { get; set; }
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public JsonDocument? ResolvedData { get; set; }
    public JsonDocument? Values { get; set; }
    public Guid? ThumbnailAssetId { get; set; }
    public string? ThumbnailUrl { get; set; }
}

