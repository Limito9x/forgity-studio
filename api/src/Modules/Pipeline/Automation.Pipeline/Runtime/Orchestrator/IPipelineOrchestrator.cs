using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
namespace Automation.Pipeline.Runtime.Orchestrator;

public interface IPipelineOrchestrator
{
    Task<Result<PipelineExecution>> ExecuteOrResumeAsync(
        Guid executionId,
        Dictionary<string, object?>? runtimeInputs = null,
        CancellationToken ct = default
    );

    Task<JsonDocument> CaptureExecutionStateSnapshotAsync(
        PipelineExecution execution,
        CancellationToken ct = default
    );
}
