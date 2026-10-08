using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.Orchestrator.Dispatchers;

public class DotNetSegmentDispatcher(
    PipelineDbContext db,
    IToolRegistry toolRegistry,
    IPinValueResolver pinResolver,
    IExecutionMemoryStore memoryStore,
    IExecutionStateStore stateStore,
    SubPipelineDispatcher subPipelineDispatcher,
    ILogger<DotNetSegmentDispatcher> logger,
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
            var isStart =
                step.Kind == PipelineNodeKind.Start
                || string.Equals(step.RefId, "Start", StringComparison.OrdinalIgnoreCase);

            if (isStart)
            {
                await RecordNodeSuccessAsync(
                    execution.Id,
                    execution.PipelineId,
                    step.NodeId,
                    new Dictionary<string, object>(),
                    ct
                );
                continue;
            }

            var isReturn =
                step.Kind == PipelineNodeKind.Return
                || string.Equals(step.RefId, "Return", StringComparison.OrdinalIgnoreCase);

            if (isReturn)
            {
                var returnResolvedInputs = await pinResolver.ResolveAllPinsAsync(
                    execution.Id,
                    step.NodeId,
                    scope: scope,
                    ct: ct
                );

                var returnOutputs = new Dictionary<string, object>(
                    StringComparer.OrdinalIgnoreCase
                );
                foreach (var (k, v) in returnResolvedInputs)
                {
                    if (v != null)
                        returnOutputs[k] = v;
                }

                var returnOutputsDict = returnOutputs.ToDictionary(
                    k => k.Key,
                    v => (object?)v.Value
                );
                await memoryStore.SetNodeAllOutputsAsync(
                    execution.Id,
                    step.NodeId,
                    returnOutputsDict,
                    scope,
                    ct
                );
                await RecordNodeSuccessAsync(
                    execution.Id,
                    execution.PipelineId,
                    step.NodeId,
                    returnOutputs,
                    ct
                );
                continue;
            }

            var isSubPipeline = step.Kind == PipelineNodeKind.SubPipeline;

            if (isSubPipeline)
            {
                var subRes = await subPipelineDispatcher.DispatchStepAsync(
                    execution,
                    step,
                    scope,
                    orchestrator,
                    ct
                );
                if (subRes.IsFailed)
                {
                    return subRes;
                }
                continue;
            }

            await RecordNodeRunningAsync(execution.Id, execution.PipelineId, step.NodeId, ct);

            var tool = toolRegistry.Get(step.RefId);
            if (tool == null)
            {
                var err = $"DotNet Tool '{step.RefId}' not found for step '{step.Label}'.";
                logger.LogError(err);
                return Result.Fail(err);
            }

            // 1. Pull all inputs on-demand
            var resolvedInputs = await pinResolver.ResolveAllPinsAsync(
                execution.Id,
                step.NodeId,
                scope: scope,
                ct: ct
            );

            // Cast to Dictionary<string, object>
            var toolInputs = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var (k, v) in resolvedInputs)
            {
                if (v != null)
                    toolInputs[k] = v;
            }

            // 2. Execute Tool
            var projectId = execution.Pipeline?.ProjectId ?? Guid.Empty;
            var toolContext = new ToolExecutionContext(
                execution.Id,
                execution.PipelineId,
                ct,
                step.NodeId,
                projectId
            );
            Dictionary<string, object> outputs;
            try
            {
                logger.LogInformation(
                    "Executing DotNet Tool [{ToolLabel}] ({NodeId})",
                    step.Label,
                    step.NodeId
                );
                outputs = await tool.ExecuteAsync(toolInputs, toolContext);
            }
            catch (Exception ex)
            {
                var err = $"Execution of tool '{step.Label}' failed: {ex.Message}";
                logger.LogError(ex, err);
                await RecordNodeFailureAsync(
                    execution.Id,
                    execution.PipelineId,
                    step.NodeId,
                    err,
                    ct
                );
                return Result.Fail(err);
            }

            // 3. Save outputs to memory store for downstream pull
            var outputsDict = outputs.ToDictionary(k => k.Key, v => (object?)v.Value);
            await memoryStore.SetNodeAllOutputsAsync(
                execution.Id,
                step.NodeId,
                outputsDict,
                scope,
                ct
            );

            // 4. Record success in DB
            await RecordNodeSuccessAsync(
                execution.Id,
                execution.PipelineId,
                step.NodeId,
                outputs,
                ct
            );
        }

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
