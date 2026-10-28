namespace Automation.Pipeline.Contracts.Tools;

public record ToolExecutionContext(
    Guid PipelineExecutionId,
    Guid PipelineId,
    CancellationToken CancellationToken,
    Guid NodeId = default,
    Guid ProjectId = default
);
