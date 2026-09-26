namespace Automation.Pipeline.Tools;

public record ToolExecutionContext(
    Guid PipelineExecutionId,
    Guid PipelineId,
    Guid AgentId,
    CancellationToken CancellationToken,
    Guid NodeId = default,
    Guid ProjectId = default
);
