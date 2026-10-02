using System.Collections.Concurrent;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace Automation.Pipeline.Engine.DataResolver;

public class PipelineGraphProvider(PipelineDbContext db) : IPipelineGraphProvider
{
    private readonly ConcurrentDictionary<Guid, Domain.Entities.PipelineExecution> _executions = new();
    private readonly ConcurrentDictionary<Guid, Domain.Entities.Pipeline> _pipelines = new();
    private readonly ConcurrentDictionary<Guid, FrozenExecutionGraph> _graphs = new();

    public void RegisterExecution(Domain.Entities.PipelineExecution execution)
    {
        _executions[execution.Id] = execution;
    }

    public void RegisterPipeline(Domain.Entities.Pipeline pipeline)
    {
        _pipelines[pipeline.Id] = pipeline;
    }

    public void RegisterFrozenGraph(Guid executionId, FrozenExecutionGraph graph)
    {
        _graphs[executionId] = graph;
    }

    public FrozenExecutionGraph? GetFrozenGraph(Guid executionId)
    {
        return _graphs.TryGetValue(executionId, out var g) ? g : null;
    }

    public async Task<Domain.Entities.PipelineExecution?> GetExecutionByIdAsync(Guid executionId, CancellationToken ct = default)
    {
        if (_executions.TryGetValue(executionId, out var cached))
        {
            return cached;
        }

        var execution = await db.PipelineExecutions
            .AsNoTracking()
            .FirstOrDefaultAsync(e => e.Id == executionId, ct);

        if (execution != null)
        {
            _executions[executionId] = execution;
        }

        return execution;
    }

    public async Task<Domain.Entities.Pipeline?> GetPipelineByExecutionIdAsync(Guid executionId, CancellationToken ct = default)
    {
        var execution = await GetExecutionByIdAsync(executionId, ct);
        if (execution == null) return null;

        return await GetPipelineByIdAsync(execution.PipelineId, ct);
    }

    public async Task<Domain.Entities.Pipeline?> GetPipelineByIdAsync(Guid pipelineId, CancellationToken ct = default)
    {
        if (_pipelines.TryGetValue(pipelineId, out var cached))
        {
            return cached;
        }

        var pipeline = await db.Pipelines
            .Include(p => p.Nodes)
            .Include(p => p.Edges)
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == pipelineId, ct);

        if (pipeline != null)
        {
            _pipelines[pipelineId] = pipeline;
        }

        return pipeline;
    }
}
