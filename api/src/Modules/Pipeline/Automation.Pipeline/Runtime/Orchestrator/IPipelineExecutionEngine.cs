using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Runtime.Planner.Models;
namespace Automation.Pipeline.Runtime.Orchestrator;

public interface IPipelineExecutionEngine
{
    Task<Result<PipelineExecution>> ExecuteOrResumeAsync(
        Guid executionId,
        Dictionary<string, object?>? runtimeInputs = null,
        CancellationToken ct = default
    );
}
