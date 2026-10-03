namespace Automation.Pipeline.Tools;

public record ToolExecutionContext(
    Guid PipelineExecutionId,
    Guid PipelineId,
    CancellationToken CancellationToken,
    Guid NodeId = default,
    Guid ProjectId = default
);
