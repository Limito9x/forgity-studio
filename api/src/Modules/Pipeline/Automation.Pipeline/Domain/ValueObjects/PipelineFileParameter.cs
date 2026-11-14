using System.Text.Json.Serialization;

namespace Automation.Pipeline.Domain.ValueObjects;

/// <summary>Persisted file pin value. The file name belongs to the referenced AssetLink.</summary>
public record PipelineFileParameter([property: JsonPropertyName("assetLinkId")] Guid AssetLinkId);

/// <summary>Confirmed upload waiting to be linked when the node is saved.</summary>
public record PipelineFileParameterDraft(
    [property: JsonPropertyName("assetId")] Guid AssetId,
    [property: JsonPropertyName("originalName")] string OriginalName
);
