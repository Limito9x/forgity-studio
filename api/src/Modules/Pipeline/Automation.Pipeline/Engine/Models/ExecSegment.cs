namespace Automation.Pipeline.Engine.Models;

public class ExecSegment
{
    public Guid SegmentId { get; init; } = Guid.NewGuid();
    public Guid? StageId { get; init; }
    public string? StageName { get; init; }
    public string Executor { get; init; } = "dotNet";
    public Guid? TargetRunnerId { get; init; }
    public List<ExecStep> Steps { get; init; } = [];
    public bool IsFlowControl { get; init; }
    public bool IsSubPipeline { get; init; }
    public ExecPlan? BodyPlan { get; set; }
    public ExecPlan? ContinuationPlan { get; set; }

    public ExecSegment() { }

    public ExecSegment(
        string executor,
        bool isFlowControl = false,
        Guid? stageId = null,
        string? stageName = null,
        Guid? targetRunnerId = null,
        bool isSubPipeline = false
    )
    {
        Executor = executor;
        IsFlowControl = isFlowControl;
        StageId = stageId;
        StageName = stageName;
        TargetRunnerId = targetRunnerId;
        IsSubPipeline = isSubPipeline;
        if (stageId.HasValue && stageId.Value != Guid.Empty)
        {
            SegmentId = stageId.Value;
        }
    }
}
