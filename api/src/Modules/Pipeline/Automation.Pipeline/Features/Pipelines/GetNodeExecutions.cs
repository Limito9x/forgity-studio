using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public class GetNodeExecutionsEndpoint(IMessageBus bus) : EndpointWithoutRequest<List<NodeExecutionDto>>
{
    public override void Configure()
    {
        Get("executions/{id:guid}/node-executions");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);

        Description(d => d
            .Produces<List<NodeExecutionDto>>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var id = Route<Guid>("id");
        var result = await bus.InvokeAsync<Result<List<NodeExecutionDto>>>(new GetNodeExecutionsQuery(id), ct);
        await this.SendResultAsync(result, ct);
    }
}

public record GetNodeExecutionsQuery(Guid ExecutionId);

[NonTransactional]
public class GetNodeExecutionsHandler(PipelineDbContext db, IExecutionStateStore stateStore)
{
    public async Task<Result<List<NodeExecutionDto>>> HandleAsync(
        GetNodeExecutionsQuery query,
        CancellationToken ct
    )
    {
        var execution = await db.PipelineExecutions
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == query.ExecutionId, ct);

        if (execution == null)
        {
            return Result.Fail<List<NodeExecutionDto>>($"Pipeline execution '{query.ExecutionId}' not found.");
        }

        var dtos = new List<NodeExecutionDto>();

        // 1. If currently executing (Running or WaitingForRunner), read directly from Redis live hot-state
        if (execution.Status is ExecutionStatus.Running or ExecutionStatus.WaitingForRunner)
        {
            var nodes = await db.PipelineNodes
                .AsNoTracking()
                .Where(n => n.PipelineId == execution.PipelineId)
                .ToListAsync(ct);

            foreach (var node in nodes)
            {
                var statusStr = await stateStore.GetNodeStatusAsync(query.ExecutionId, node.Id, ct);
                if (statusStr == null) continue;

                var status = Enum.TryParse<ExecutionStatus>(statusStr, true, out var sEnum) ? sEnum : ExecutionStatus.Pending;
                var outputs = await stateStore.GetNodeAllOutputsAsync(query.ExecutionId, node.Id, ct);
                JsonDocument? outputDoc = null;
                if (outputs.Count > 0)
                {
                    outputDoc = JsonDocument.Parse(JsonSerializer.Serialize(outputs));
                }

                dtos.Add(new NodeExecutionDto(
                    Guid.Empty,
                    query.ExecutionId,
                    node.Id,
                    status,
                    null,
                    null,
                    null,
                    outputDoc,
                    null
                ));
            }

            return Result.Ok(dtos);
        }

        // 2. If finished, read from PostgreSQL JSONB snapshot (execution.ExecutionState)
        if (execution.ExecutionState != null)
        {
            try
            {
                var root = execution.ExecutionState.RootElement;
                if (root.TryGetProperty("nodeExecutions", out var nodesProp) && nodesProp.ValueKind == JsonValueKind.Array)
                {
                    foreach (var elem in nodesProp.EnumerateArray())
                    {
                        var nodeId = elem.TryGetProperty("nodeId", out var nId) && Guid.TryParse(nId.GetString(), out var gId) ? gId : Guid.Empty;
                        var status = elem.TryGetProperty("status", out var st) && Enum.TryParse<ExecutionStatus>(st.GetString(), true, out var sEnum) ? sEnum : ExecutionStatus.Pending;
                        var errMsg = elem.TryGetProperty("errorMessage", out var err) ? err.GetString() : null;
                        JsonDocument? output = elem.TryGetProperty("output", out var outProp) ? JsonDocument.Parse(outProp.GetRawText()) : null;
                        JsonDocument? log = elem.TryGetProperty("log", out var logProp) ? JsonDocument.Parse(logProp.GetRawText()) : null;

                        dtos.Add(new NodeExecutionDto(
                            Guid.Empty,
                            query.ExecutionId,
                            nodeId,
                            status,
                            null,
                            null,
                            errMsg,
                            output,
                            log
                        ));
                    }
                }
            }
            catch { }
        }

        // 3. Fallback: if snapshot has no nodeExecutions recorded yet (e.g. legacy/testing), attempt fallback to Redis
        if (dtos.Count == 0)
        {
            var nodes = await db.PipelineNodes
                .AsNoTracking()
                .Where(n => n.PipelineId == execution.PipelineId)
                .ToListAsync(ct);

            foreach (var node in nodes)
            {
                var statusStr = await stateStore.GetNodeStatusAsync(query.ExecutionId, node.Id, ct);
                if (statusStr == null) continue;

                var status = Enum.TryParse<ExecutionStatus>(statusStr, true, out var sEnum) ? sEnum : ExecutionStatus.Pending;
                var outputs = await stateStore.GetNodeAllOutputsAsync(query.ExecutionId, node.Id, ct);
                JsonDocument? outputDoc = null;
                if (outputs.Count > 0)
                {
                    outputDoc = JsonDocument.Parse(JsonSerializer.Serialize(outputs));
                }

                dtos.Add(new NodeExecutionDto(
                    Guid.Empty,
                    query.ExecutionId,
                    node.Id,
                    status,
                    null,
                    null,
                    null,
                    outputDoc,
                    null
                ));
            }
        }

        return Result.Ok(dtos);
    }
}
