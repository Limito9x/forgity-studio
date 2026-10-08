namespace Automation.Pipeline.Domain.ValueObjects;

/// <summary>Persisted file pin value. The file name belongs to the referenced AssetLink.</summary>
public record PipelineFileParameter(Guid AssetLinkId);

/// <summary>Confirmed upload waiting to be linked when the node is saved.</summary>
public record PipelineFileParameterDraft(Guid AssetId, string OriginalName);
