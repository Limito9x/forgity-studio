using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.DataResolver.Resolvers;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.Orchestrator.Dispatchers;

public class SubPipelineDispatcher(
    PipelineDbContext db,
    IPinValueResolver pinResolver,
    IExecutionMemoryStore memoryStore,
    IExecutionStateStore stateStore,
    ILogger<SubPipelineDispatcher> logger,
    IHubContext<PipelineExecutionHub>? hubContext = null
)
{
    public async Task<Result> DispatchAsync(
        PipelineExecution execution,
        ExecSegment segment,
        ScopeContext? scope = null,
        IPipelineOrchestrator? orchestrator = null,
        CancellationToken ct = default
    )
    {
        foreach (var step in segment.Steps)
        {
            var stepRes = await DispatchStepAsync(execution, step, scope, orchestrator, ct);
            if (stepRes.IsFailed)
            {
                return stepRes;
            }
        }

        return Result.Ok();
    }

    public async Task<Result> DispatchStepAsync(
        PipelineExecution execution,
        ExecStep step,
        ScopeContext? scope = null,
        IPipelineOrchestrator? orchestrator = null,
        CancellationToken ct = default
    )
    {
        await RecordNodeRunningAsync(execution.Id, execution.PipelineId, step.NodeId, ct);

        var subResolvedInputs = await pinResolver.ResolveAllPinsAsync(
            execution.Id,
            step.NodeId,
            scope: scope,
            ct: ct
        );

        Guid? targetPipelineId = null;
        if (Guid.TryParse(step.RefId, out var parsedRefId))
        {
            targetPipelineId = parsedRefId;
        }
        else if (step.Config != null)
        {
            try
            {
                if (
                    step.Config.RootElement.TryGetProperty("pipelineId", out var pProp)
                    && pProp.TryGetGuid(out var gid)
                )
                {
                    targetPipelineId = gid;
                }
            }
            catch { }
        }

        if (!targetPipelineId.HasValue || targetPipelineId.Value == Guid.Empty)
        {
            var err = $"Sub-Pipeline target not configured for step '{step.Label}'.";
            logger.LogError(err);
            await RecordNodeFailureAsync(execution.Id, execution.PipelineId, step.NodeId, err, ct);
            return Result.Fail(err);
        }

        var childPipeline = await db
            .Pipelines.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == targetPipelineId.Value, ct);

        if (childPipeline == null)
        {
            var err = $"Target Sub-Pipeline '{targetPipelineId.Value}' not found.";
            logger.LogError(err);
            await RecordNodeFailureAsync(execution.Id, execution.PipelineId, step.NodeId, err, ct);
            return Result.Fail(err);
        }

        var childExecution = new PipelineExecution(
            childPipeline.Id,
            parentExecutionId: execution.Id,
            triggeredByNodeId: step.NodeId
        );
        db.PipelineExecutions.Add(childExecution);
        await db.SaveChangesAsync(ct);

        var childInputs = new Dictionary<string, object?>(
            subResolvedInputs,
            StringComparer.OrdinalIgnoreCase
        );

        logger.LogInformation(
            "Executing Sub-Pipeline [{ChildName}] ({ChildPipelineId}) under Execution {ExecutionId}",
            childPipeline.Name,
            childPipeline.Id,
            execution.Id
        );

        if (orchestrator == null)
        {
            var err = "Orchestrator instance required for Sub-Pipeline execution.";
            logger.LogError(err);
            await RecordNodeFailureAsync(execution.Id, execution.PipelineId, step.NodeId, err, ct);
            return Result.Fail(err);
        }

        var childResult = await orchestrator.ExecuteOrResumeAsync(
            childExecution.Id,
            childInputs,
            ct
        );

        if (childResult.IsFailed || childResult.Value.Status == ExecutionStatus.Failed)
        {
            var err =
                childResult.Errors.FirstOrDefault()?.Message
                ?? childResult.Value.ErrorMessage
                ?? "Sub-Pipeline execution failed.";
            logger.LogError(err);
            await RecordNodeFailureAsync(execution.Id, execution.PipelineId, step.NodeId, err, ct);
            return Result.Fail(err);
        }

        // Collect outputs from child Return node (if any) or memory store
        var subOutputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var childReturnNode = await db
            .PipelineNodes.AsNoTracking()
            .FirstOrDefaultAsync(
                n => n.PipelineId == childPipeline.Id && n.Kind == PipelineNodeKind.Return,
                ct
            );

        // 1. Try reading outputs directly from child execution parameters snapshot
        if (childExecution.ExecutionState != null)
        {
            try
            {
                var rootElem = childExecution.ExecutionState.RootElement;
                if (
                    rootElem.TryGetProperty("parameters", out var pElem)
                    && pElem.TryGetProperty("outputs", out var oElem)
                    && oElem.ValueKind == JsonValueKind.Object
                )
                {
                    foreach (var prop in oElem.EnumerateObject())
                    {
                        subOutputs[prop.Name] = InlineConfigResolver.NormalizeJsonElement(
                            prop.Value
                        );
                    }
                }
            }
            catch { }
        }

        if (childReturnNode != null && subOutputs.Count == 0)
        {
            var childOutputs = await stateStore.GetNodeAllOutputsAsync(
                childExecution.Id,
                childReturnNode.Id,
                ct
            );
            if (childOutputs.Count > 0)
            {
                foreach (var (k, v) in childOutputs)
                {
                    subOutputs[k] = v;
                }
            }
        }

        await memoryStore.SetNodeAllOutputsAsync(execution.Id, step.NodeId, subOutputs, scope, ct);
        var successOutputs = new Dictionary<string, object>();
        foreach (var (k, v) in subOutputs)
        {
            successOutputs[k] = v ?? string.Empty;
        }
        await RecordNodeSuccessAsync(
            execution.Id,
            execution.PipelineId,
            step.NodeId,
            successOutputs,
            ct
        );

        return Result.Ok();
    }

    private async Task RecordNodeSuccessAsync(
        Guid executionId,
        Guid pipelineId,
        Guid nodeId,
        Dictionary<string, object> outputs,
        CancellationToken ct
    )
    {
        await stateStore.SetNodeStatusAsync(executionId, nodeId, "succeeded", ct);
        await stateStore.SetNodeOutputsAsync(
            executionId,
            nodeId,
            outputs.ToDictionary(k => k.Key, v => (object?)v.Value),
            ct
        );

        if (hubContext != null)
        {
            try
            {
                await hubContext
                    .Clients.Group($"pipeline_{pipelineId}")
                    .SendAsync(
                        "PipelineNodeExecutionUpdated",
                        new
                        {
                            executionId,
                            pipelineId,
                            nodeId,
                            status = "succeeded",
                            outputs,
                            finishedAt = DateTimeOffset.UtcNow,
                        },
                        ct
                    );
            }
            catch (Exception ex)
            {
                logger.LogWarning(
                    ex,
                    "Failed to broadcast PipelineNodeExecutionUpdated via SignalR for {NodeId}",
                    nodeId
                );
            }
        }
    }

    private async Task RecordNodeRunningAsync(
        Guid executionId,
        Guid pipelineId,
        Guid nodeId,
        CancellationToken ct
    )
    {
        await stateStore.SetNodeStatusAsync(executionId, nodeId, "running", ct);

        if (hubContext != null)
        {
            try
            {
                await hubContext
                    .Clients.Group($"pipeline_{pipelineId}")
                    .SendAsync(
                        "PipelineNodeExecutionUpdated",
                        new
                        {
                            executionId,
                            pipelineId,
                            nodeId,
                            status = "running",
                            startedAt = DateTimeOffset.UtcNow,
                        },
                        ct
                    );
            }
            catch (Exception ex)
            {
                logger.LogWarning(
                    ex,
                    "Failed to broadcast PipelineNodeExecutionUpdated via SignalR for {NodeId}",
                    nodeId
                );
            }
        }
    }

    private async Task RecordNodeFailureAsync(
        Guid executionId,
        Guid pipelineId,
        Guid nodeId,
        string error,
        CancellationToken ct
    )
    {
        await stateStore.SetNodeStatusAsync(executionId, nodeId, "failed", ct);

        if (hubContext != null)
        {
            try
            {
                await hubContext
                    .Clients.Group($"pipeline_{pipelineId}")
                    .SendAsync(
                        "PipelineNodeExecutionUpdated",
                        new
                        {
                            executionId,
                            pipelineId,
                            nodeId,
                            status = "failed",
                            errorMessage = error,
                            finishedAt = DateTimeOffset.UtcNow,
                        },
                        ct
                    );
            }
            catch (Exception ex)
            {
                logger.LogWarning(
                    ex,
                    "Failed to broadcast PipelineNodeExecutionUpdated via SignalR for {NodeId}",
                    nodeId
                );
            }
        }
    }
}
