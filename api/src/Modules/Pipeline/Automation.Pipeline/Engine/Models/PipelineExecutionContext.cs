namespace Automation.Pipeline.Engine.Models;

/// <summary>
/// Ngữ cảnh một phiên thực thi Pipeline (Context Object Pattern).
/// Tập trung toàn bộ thông tin runtime phiên chạy, loại bỏ AgentId toàn cục.
/// Mọi thông tin Runner đều được gắn theo từng Stage trong FrozenExecutionGraph.
/// </summary>
public sealed class PipelineExecutionContext
{
    public Guid ExecutionId { get; init; }
    public Guid PipelineId { get; init; }
    public Guid ProjectId { get; init; }
    public FrozenExecutionGraph Graph { get; init; } = default!;
    public ScopeContext? Scope { get; set; }
    public CancellationToken CancellationToken { get; init; }

    /// <summary>
    /// Guard chống đệ quy vòng lặp cho demand-driven pure node evaluation (Pattern 5: CallStack Guard)
    /// </summary>
    public HashSet<Guid> PureNodeCallStack { get; } = [];

    public PipelineExecutionContext(
        Guid executionId,
        Guid pipelineId,
        Guid projectId,
        FrozenExecutionGraph graph,
        ScopeContext? scope = null,
        CancellationToken cancellationToken = default
    )
    {
        ExecutionId = executionId;
        PipelineId = pipelineId;
        ProjectId = projectId;
        Graph = graph;
        Scope = scope;
        CancellationToken = cancellationToken;
    }
}
