using Automation.SharedKernel.Domain.Entities;

namespace Automation.Pipeline.Domain.Entities;

public static class PipelineSnapshotSource
{
    public const string ManualCheckpoint = "ManualCheckpoint";
    public const string RunFreeze = "RunFreeze";
    public const string AiMcp = "AiMcp";
    public const string Import = "Import";
    public const string Migration = "Migration";
    public const string AutoMilestone = "AutoMilestone";
}

public class PipelineSnapshot : AuditableEntity
{
    public Guid PipelineId { get; set; }
    public Pipeline Pipeline { get; set; } = null!;

    public int VersionNumber { get; set; }
    public PipelineGraphDocument GraphData { get; set; } = new();
    public string GraphHash { get; set; } = string.Empty;
    public string Source { get; set; } = PipelineSnapshotSource.ManualCheckpoint;
    public string? Summary { get; set; }

    public PipelineSnapshot() : base() { }

    public PipelineSnapshot(
        Guid pipelineId,
        int versionNumber,
        PipelineGraphDocument graphData,
        string graphHash,
        string source = PipelineSnapshotSource.ManualCheckpoint,
        string? summary = null,
        Guid? id = null
    ) : base(id ?? Guid.Empty)
    {
        PipelineId = pipelineId;
        VersionNumber = versionNumber;
        GraphData = graphData ?? new();
        GraphHash = graphHash ?? string.Empty;
        Source = source;
        Summary = summary;
    }
}

