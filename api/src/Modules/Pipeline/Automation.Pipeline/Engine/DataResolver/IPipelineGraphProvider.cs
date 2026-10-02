using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Engine.Models;

namespace Automation.Pipeline.Engine.DataResolver;

public interface IPipelineGraphProvider
{
    Task<PipelineExecution?> GetExecutionByIdAsync(Guid executionId, CancellationToken ct = default);
    Task<Domain.Entities.Pipeline?> GetPipelineByExecutionIdAsync(Guid executionId, CancellationToken ct = default);
    Task<Domain.Entities.Pipeline?> GetPipelineByIdAsync(Guid pipelineId, CancellationToken ct = default);

    void RegisterExecution(PipelineExecution execution) { }
    void RegisterPipeline(Domain.Entities.Pipeline pipeline) { }
    void RegisterFrozenGraph(Guid executionId, FrozenExecutionGraph graph) { }
    FrozenExecutionGraph? GetFrozenGraph(Guid executionId) => null;
}
