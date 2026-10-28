using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Runtime.DataResolver;
using Automation.Pipeline.Runtime.DataResolver.Resolvers;
using Automation.Pipeline.Runtime.Planner.Models;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Runtime.Orchestrator.Dispatchers;

public enum SubPipelineDispatchStatus
{
    Completed,
    Suspended,
    Failed
}

public record SubPipelineDispatchResult(
    SubPipelineDispatchStatus Status,
    Guid? ChildExecutionId = null,
    string? ErrorMessage = null
);

public class SubPipelineDispatcher(
    PipelineDbContext db,
    IPinValueResolver pinResolver,
    IExecutionMemoryStore memoryStore,
    IExecutionStateStore stateStore,
    ILogger<SubPipelineDispatcher> logger,
    IHubContext<PipelineExecutionHub>? hubContext = null
)
{
    public async Task<Result<SubPipelineDispatchResult>> DispatchAsync(
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
                return Result.Fail<SubPipelineDispatchResult>(stepRes.Errors);
            }

            if (stepRes.Value.Status == SubPipelineDispatchStatus.Suspended)
            {
                return Result.Ok(stepRes.Value);
            }
        }

        return Result.Ok(new SubPipelineDispatchResult(SubPipelineDispatchStatus.Completed));
    }

    public async Task<Result<SubPipelineDispatchResult>> DispatchStepAsync(
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
            return Result.Fail<SubPipelineDispatchResult>(err);
        }

        var childPipeline = await db
            .Pipelines.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == targetPipelineId.Value, ct);

        if (childPipeline == null)
        {
            var err = $"Target Sub-Pipeline '{targetPipelineId.Value}' not found.";
            logger.LogError(err);
            await RecordNodeFailureAsync(execution.Id, execution.PipelineId, step.NodeId, err, ct);
            return Result.Fail<SubPipelineDispatchResult>(err);
        }

        var childExecution = new PipelineExecution(
            childPipeline.Id,
            parentExecutionId: execution.Id,
            triggeredByNodeId: step.NodeId
        );
        db.PipelineExecutions.Add(childExecution);
        await db.SaveChangesAsync(ct);

        // 1. Inherit runtime inputs from parent execution (e.g. targetRunnerId, runnerId, environment configs)
        var childInputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        if (execution.ExecutionState != null)
        {
            var doc = execution.ExecutionState;
            if (doc.RootElement.TryGetProperty("RuntimeInputs", out var rInputs) || doc.RootElement.TryGetProperty("runtimeInputs", out rInputs))
            {
                foreach (var prop in rInputs.EnumerateObject())
                {
                    childInputs[prop.Name] = prop.Value.ValueKind switch
                    {
                        System.Text.Json.JsonValueKind.String => prop.Value.GetString(),
                        System.Text.Json.JsonValueKind.Number => prop.Value.TryGetInt64(out var l) ? l : prop.Value.GetDouble(),
                        System.Text.Json.JsonValueKind.True => true,
                        System.Text.Json.JsonValueKind.False => false,
                        System.Text.Json.JsonValueKind.Null => null,
                        _ => prop.Value.GetRawText()
                    };
                }
            }
        }

        // 2. Overwrite with explicit pin inputs connected to the SubPipeline node
        foreach (var (k, v) in subResolvedInputs)
        {
            childInputs[k] = v;
        }

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
            return Result.Fail<SubPipelineDispatchResult>(err);
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
                ?? childResult.Value?.ErrorMessage
                ?? "Sub-Pipeline execution failed.";
            logger.LogError(err);
            await RecordNodeFailureAsync(execution.Id, execution.PipelineId, step.NodeId, err, ct);
            return Result.Fail<SubPipelineDispatchResult>(err);
        }

        // Nếu Child tạm dừng (chờ Runner hoặc chờ Sub-Pipeline tiếp theo), đình chỉ Parent
        if (childResult.Value.Status is ExecutionStatus.WaitingForRunner or ExecutionStatus.WaitingForSubPipeline)
        {
            logger.LogInformation(
                "Child execution {ChildExecutionId} suspended with status {Status}. Suspending parent execution {ParentExecutionId}.",
                childExecution.Id,
                childResult.Value.Status,
                execution.Id
            );
            return Result.Ok(new SubPipelineDispatchResult(SubPipelineDispatchStatus.Suspended, childExecution.Id));
        }

        // Child đã chạy xong đồng bộ (ví dụ: child chỉ gồm các node dotNet)
        await CompleteFromChildAsync(
            execution,
            childResult.Value,
            step.NodeId,
            scope,
            ct
        );

        return Result.Ok(new SubPipelineDispatchResult(SubPipelineDispatchStatus.Completed, childExecution.Id));
    }

    public async Task<Result> CompleteFromChildAsync(
        PipelineExecution parentExecution,
        PipelineExecution childExecution,
        Guid macroNodeId,
        ScopeContext? scope = null,
        CancellationToken ct = default
    )
    {
        var subOutputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        // 1. Đọc outputs trực tiếp từ parameters snapshot của child execution nếu có
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
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to parse outputs from child execution state {ChildExecutionId}", childExecution.Id);
            }
        }

        // 2. Fallback nếu snapshot chưa có outputs: tìm node Return của child pipeline
        if (subOutputs.Count == 0)
        {
            var childReturnNode = await db
                .PipelineNodes.AsNoTracking()
                .FirstOrDefaultAsync(
                    n => n.PipelineId == childExecution.PipelineId && n.Kind == PipelineNodeKind.Return,
                    ct
                );

            if (childReturnNode != null)
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
        }

        await memoryStore.SetNodeAllOutputsAsync(parentExecution.Id, macroNodeId, subOutputs, scope, ct);
        var successOutputs = new Dictionary<string, object>();
        foreach (var (k, v) in subOutputs)
        {
            successOutputs[k] = v ?? string.Empty;
        }

        await RecordNodeSuccessAsync(
            parentExecution.Id,
            parentExecution.PipelineId,
            macroNodeId,
            successOutputs,
            ct
        );

        return Result.Ok();
    }

    public async Task RecordNodeSuccessAsync(
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

    public async Task RecordNodeRunningAsync(
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

    public async Task RecordNodeFailureAsync(
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
