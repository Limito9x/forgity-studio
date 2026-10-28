using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Runtime.Orchestrator;
namespace Automation.Pipeline.Runtime.Orchestrator;

/// <summary>
/// Transition facade forwarding all execution to IPipelineOrchestrator.
/// </summary>
public class PipelineExecutionEngine(
    IPipelineOrchestrator orchestrator
) : IPipelineExecutionEngine
{
    public Task<Result<PipelineExecution>> ExecuteOrResumeAsync(
        Guid executionId,
        Dictionary<string, object?>? runtimeInputs = null,
        CancellationToken ct = default
    )
    {
        return orchestrator.ExecuteOrResumeAsync(executionId, runtimeInputs, ct);
    }
}
