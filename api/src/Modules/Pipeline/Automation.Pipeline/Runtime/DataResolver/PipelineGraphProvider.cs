using System.Collections.Concurrent;
using Automation.Pipeline.Runtime.Planner.Models;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.ValueObjects;

namespace Automation.Pipeline.Runtime.DataResolver;

public class PipelineGraphProvider(PipelineDbContext db) : IPipelineGraphProvider
{
    private readonly ConcurrentDictionary<Guid, Domain.Entities.PipelineExecution> _executions = new();
    private readonly ConcurrentDictionary<Guid, Domain.Entities.Pipeline> _pipelines = new();
    private readonly ConcurrentDictionary<Guid, FrozenExecutionGraph> _graphs = new();
    private readonly Dictionary<Guid, List<NodeDefinition>> _definitions = new();

    public async Task<IReadOnlyList<PinDefinition>> GetCustomNodeInputsAsync(PipelineNode node, CancellationToken ct = default)
    {
        var pipeline = await GetPipelineByIdAsync(node.PipelineId, ct);
        if (pipeline == null) return [];
        if (!_definitions.TryGetValue(pipeline.ProjectId, out var definitions))
        {
            definitions = await db.NodeDefinitions.AsNoTracking().Where(x => x.ProjectId == pipeline.ProjectId).ToListAsync(ct);
            _definitions[pipeline.ProjectId] = definitions;
        }
        return definitions.FirstOrDefault(x =>
            string.Equals(x.Key, node.RefId, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(x.Id.ToString(), node.RefId, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(x.Name, node.RefId, StringComparison.OrdinalIgnoreCase))?.Inputs ?? [];
    }

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

        var pipeline = await GetPipelineByIdAsync(execution.PipelineId, ct);
        if (pipeline == null) return null;

        // Nếu execution có SnapshotId, nạp GraphData từ Snapshot bất biến
        if (execution.SnapshotId.HasValue)
        {
            var snapshot = await db.PipelineSnapshots
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.Id == execution.SnapshotId.Value, ct);
            if (snapshot != null)
            {
                var frozenPipeline = new Domain.Entities.Pipeline(
                    pipeline.ProjectId,
                    pipeline.Name,
                    pipeline.TriggerType,
                    pipeline.TriggerConfig
                )
                {
                    Id = pipeline.Id,
                    GraphData = snapshot.GraphData,
                    GraphHash = snapshot.GraphHash,
                    ActiveSnapshotId = snapshot.Id
                };
                return frozenPipeline;
            }
        }

        return pipeline;
    }

    public async Task<Domain.Entities.Pipeline?> GetPipelineByIdAsync(Guid pipelineId, CancellationToken ct = default)
    {
        if (_pipelines.TryGetValue(pipelineId, out var cached))
        {
            return cached;
        }

        var pipeline = await db.Pipelines
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == pipelineId, ct);

        if (pipeline != null)
        {
            _pipelines[pipelineId] = pipeline;
        }

        return pipeline;
    }
}
