using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.ExecPlanner;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Engine.Orchestrator.Dispatchers;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.Orchestrator;

public class PipelineOrchestrator(
    PipelineDbContext db,
    IExecPlanner execPlanner,
    IExecutionMemoryStore memoryStore,
    IExecutionStateStore stateStore,
    DotNetSegmentDispatcher dotNetDispatcher,
    RunnerSegmentDispatcher runnerDispatcher,
    ForEachDispatcher forEachDispatcher,
    SubPipelineDispatcher subPipelineDispatcher,
    IToolRegistry toolRegistry,
    IHubContext<PipelineExecutionHub>? hubContext,
    ILogger<PipelineOrchestrator> logger,
    DataResolver.IPipelineGraphProvider? graphProvider = null
) : IPipelineOrchestrator
{
    public async Task<Result<PipelineExecution>> ExecuteOrResumeAsync(
        Guid executionId,
        Dictionary<string, object?>? runtimeInputs = null,
        CancellationToken ct = default
    )
    {
        var execution = await db.PipelineExecutions
            .Include(x => x.Pipeline)
                .ThenInclude(p => p.Nodes)
            .Include(x => x.Pipeline)
                .ThenInclude(p => p.Edges)
            .FirstOrDefaultAsync(x => x.Id == executionId, ct);

        if (execution == null)
        {
            return Result.Fail<PipelineExecution>($"Pipeline execution '{executionId}' not found.");
        }

        graphProvider?.RegisterExecution(execution);
        if (execution.Pipeline != null)
        {
            graphProvider?.RegisterPipeline(execution.Pipeline);
        }

        if (execution.Status == ExecutionStatus.Succeeded || execution.Status == ExecutionStatus.Cancelled)
        {
            return Result.Ok(execution);
        }

        // 1. Load Custom Node Definitions for this Project
        var customDefs = await db.NodeDefinitions
            .AsNoTracking()
            .Where(x => x.ProjectId == execution.Pipeline.ProjectId)
            .ToListAsync(ct);

        // 2. Populate Runtime / Start Inputs into Memory Store (from defaults, persisted ExecutionState, or arguments)
        var mergedStartInputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        if (execution.Pipeline.Parameters != null)
        {
            var startInputs = execution.Pipeline.Parameters
                .Where(p => p.Kind == Domain.Enums.PipelineParameterKind.Input);

            foreach (var input in startInputs)
            {
                if (!string.IsNullOrEmpty(input.DefaultValue))
                {
                    try
                    {
                        var parsedVal = JsonSerializer.Deserialize<object>(input.DefaultValue);
                        mergedStartInputs[input.Key] = parsedVal;
                    }
                    catch
                    {
                        mergedStartInputs[input.Key] = input.DefaultValue;
                    }
                }
            }
        }

        if (execution.ExecutionState != null)
        {
            try
            {
                var stateObj = Automation.Pipeline.Engine.Models.PipelineExecutionState.FromJsonDocument(execution.ExecutionState);
                if (stateObj?.RuntimeInputs != null)
                {
                    foreach (var (k, v) in stateObj.RuntimeInputs)
                    {
                        mergedStartInputs[k] = v;
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to parse RuntimeInputs from ExecutionState for {ExecutionId}", execution.Id);
            }
        }

        if (runtimeInputs != null)
        {
            foreach (var (k, v) in runtimeInputs)
            {
                mergedStartInputs[k] = v;
            }
        }

        foreach (var (k, v) in mergedStartInputs)
        {
            await memoryStore.SetStartInputAsync(execution.Id, k, v, ct);
        }

        // 3. Initialize Pipeline Variables into Memory Store (Execution Context) only when starting execution
        if (execution.NextNodeIndex == 0 && execution.Pipeline.Parameters != null)
        {
            var variables = execution.Pipeline.Parameters
                .Where(p => p.Kind == Domain.Enums.PipelineParameterKind.Variable);

            foreach (var v in variables)
            {
                var existing = await memoryStore.GetVariableAsync(execution.Id, v.Key, ct);
                if (existing == null)
                {
                    object? initVal = !string.IsNullOrWhiteSpace(v.DefaultValue)
                        ? v.DefaultValue
                        : v.Cardinality switch
                        {
                            PinCardinality.Map => new Dictionary<string, object?>(),
                            PinCardinality.Array => new List<object?>(),
                            _ => v.Type switch
                            {
                                PinPrimitiveType.Number => 0,
                                PinPrimitiveType.Boolean => false,
                                _ => string.Empty
                            }
                        };
                    await memoryStore.SetVariableAsync(execution.Id, v.Key, initVal, ct);
                }
            }
        }

        // 4. Compile ExecPlan
        var plan = execPlanner.BuildExecPlan(
            execution.Pipeline,
            customDefs,
            toolRegistry,
            runtimeInputs
        );

        if (plan.Graph != null)
        {
            graphProvider?.RegisterFrozenGraph(execution.Id, plan.Graph);
        }

        if (!plan.IsValid)
        {
            if (plan.CycleNodeIds.Count > 0)
            {
                var cycleError = $"Pipeline contains cycle involving nodes: {string.Join(", ", plan.CycleNodeIds)}";
                execution.MarkFailed(cycleError, execution.ExecutionState ?? JsonDocument.Parse("{}"));
                await db.SaveChangesAsync(ct);

                if (hubContext != null)
                {
                    await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                        "PipelineExecutionFinished",
                        new { executionId = execution.Id, pipelineId = execution.PipelineId, status = (int)execution.Status, finishedAt = execution.FinishedAt, errorMessage = cycleError, executionState = execution.ExecutionState },
                        ct
                    );
                }

                return Result.Fail<PipelineExecution>(cycleError);
            }

            if (plan.UnresolvedPins.Count > 0)
            {
                var unresolvedMsg = $"Pipeline execution has {plan.UnresolvedPins.Count} unresolved required pin(s): {string.Join(", ", plan.UnresolvedPins.Select(p => $"{p.NodeLabel}.{p.PinLabel}"))}";
                execution.MarkFailed(unresolvedMsg, execution.ExecutionState ?? JsonDocument.Parse("{}"));
                await db.SaveChangesAsync(ct);

                if (hubContext != null)
                {
                    await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                        "PipelineExecutionFinished",
                        new { executionId = execution.Id, pipelineId = execution.PipelineId, status = (int)execution.Status, finishedAt = execution.FinishedAt, errorMessage = unresolvedMsg, executionState = execution.ExecutionState },
                        ct
                    );
                }

                return Result.Fail<PipelineExecution>(new UnresolvedPinsError(plan.UnresolvedPins));
            }

            var generalPlanError = "Pipeline execution plan is invalid.";
            execution.MarkFailed(generalPlanError, execution.ExecutionState ?? JsonDocument.Parse("{}"));
            await db.SaveChangesAsync(ct);

            if (hubContext != null)
            {
                await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                    "PipelineExecutionFinished",
                    new { executionId = execution.Id, pipelineId = execution.PipelineId, status = (int)execution.Status, finishedAt = execution.FinishedAt, errorMessage = generalPlanError, executionState = execution.ExecutionState },
                    ct
                );
            }

            return Result.Fail<PipelineExecution>(generalPlanError);
        }

        if (execution.Status == ExecutionStatus.Pending)
        {
            execution.Start();
            await db.SaveChangesAsync(ct);

            if (hubContext != null)
            {
                await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                    "PipelineExecutionStarted",
                    new { executionId = execution.Id, pipelineId = execution.PipelineId, status = (int)execution.Status, startedAt = execution.StartedAt },
                    ct
                );
            }
        }
        else if (execution.Status == ExecutionStatus.WaitingForRunner)
        {
            execution.Resume();
            await db.SaveChangesAsync(ct);
        }

        var rootScope = new ScopeContext("root");

        // 5. Sequential Segment Dispatch Loop
        for (var segIdx = execution.NextNodeIndex; segIdx < plan.Segments.Count; segIdx++)
        {
            var segment = plan.Segments[segIdx];
            logger.LogInformation("Processing ExecSegment #{Index} [{Executor}] (Steps: {Count})",
                segIdx, segment.Executor, segment.Steps.Count);

            if (segment.IsFlowControl)
            {
                var fcRes = await forEachDispatcher.DispatchAsync(execution, segment, rootScope, this, ct);
                if (fcRes.IsFailed)
                {
                    var err = fcRes.Errors.FirstOrDefault()?.Message ?? "FlowControl execution failed";
                    var failSnapshot = await CaptureExecutionStateSnapshotAsync(execution, ct);
                    execution.MarkFailed(err, failSnapshot);
                    await db.SaveChangesAsync(ct);

                    if (hubContext != null)
                    {
                        await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                            "PipelineExecutionFinished",
                            new { executionId = execution.Id, pipelineId = execution.PipelineId, status = (int)execution.Status, finishedAt = execution.FinishedAt, errorMessage = err, executionState = failSnapshot },
                            ct
                        );
                    }

                    return Result.Fail<PipelineExecution>(fcRes.Errors);
                }
            }
            else if (segment.IsSubPipeline)
            {
                var subRes = await subPipelineDispatcher.DispatchAsync(execution, segment, rootScope, this, ct);
                if (subRes.IsFailed)
                {
                    var err = subRes.Errors.FirstOrDefault()?.Message ?? "SubPipeline execution failed";
                    var failSnapshot = await CaptureExecutionStateSnapshotAsync(execution, ct);
                    execution.MarkFailed(err, failSnapshot);
                    await db.SaveChangesAsync(ct);

                    if (hubContext != null)
                    {
                        await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                            "PipelineExecutionFinished",
                            new { executionId = execution.Id, pipelineId = execution.PipelineId, status = (int)execution.Status, finishedAt = execution.FinishedAt, errorMessage = err, executionState = failSnapshot },
                            ct
                        );
                    }

                    return Result.Fail<PipelineExecution>(subRes.Errors);
                }
            }
            else if (string.Equals(segment.Executor, "dotNet", StringComparison.OrdinalIgnoreCase))
            {
                var dotNetRes = await dotNetDispatcher.DispatchAsync(execution, segment, rootScope, this, ct);
                if (dotNetRes.IsFailed)
                {
                    var err = dotNetRes.Errors.FirstOrDefault()?.Message ?? "DotNet segment execution failed";
                    var failSnapshot = await CaptureExecutionStateSnapshotAsync(execution, ct);
                    execution.MarkFailed(err, failSnapshot);
                    await db.SaveChangesAsync(ct);

                    if (hubContext != null)
                    {
                        await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                            "PipelineExecutionFinished",
                            new { executionId = execution.Id, pipelineId = execution.PipelineId, status = (int)execution.Status, finishedAt = execution.FinishedAt, errorMessage = err, executionState = failSnapshot },
                            ct
                        );
                    }

                    return Result.Fail<PipelineExecution>(dotNetRes.Errors);
                }
            }
            else
            {
                // Worker Segment on Runner (Blender / Unreal / Python)
                var agentRes = await runnerDispatcher.DispatchAsync(
                    execution,
                    segment,
                    segIdx + 1,
                    customDefs,
                    rootScope,
                    ct
                );

                if (agentRes.IsFailed)
                {
                    var err = agentRes.Errors.FirstOrDefault()?.Message ?? "Agent dispatch failed";
                    var failSnapshot = await CaptureExecutionStateSnapshotAsync(execution, ct);
                    execution.MarkFailed(err, failSnapshot);
                    await db.SaveChangesAsync(ct);

                    if (hubContext != null)
                    {
                        await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                            "PipelineExecutionFinished",
                            new { executionId = execution.Id, pipelineId = execution.PipelineId, status = (int)execution.Status, finishedAt = execution.FinishedAt, errorMessage = err, executionState = failSnapshot },
                            ct
                        );
                    }

                    return Result.Fail<PipelineExecution>(agentRes.Errors);
                }

                // Suspend and wait for Agent completion event
                await db.SaveChangesAsync(ct);
                return Result.Ok(execution);
            }
        }

        // 6. All segments succeeded - Capture complete parameter and state snapshot
        var finalSnapshot = await CaptureExecutionStateSnapshotAsync(execution, ct);
        execution.MarkSucceeded(finalSnapshot);
        await db.SaveChangesAsync(ct);

        if (hubContext != null)
        {
            await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                "PipelineExecutionFinished",
                new { executionId = execution.Id, pipelineId = execution.PipelineId, status = (int)execution.Status, finishedAt = execution.FinishedAt, executionState = finalSnapshot },
                ct
            );
        }

        // Set 48h TTL on hot Redis keys now that atomic state is persisted in Postgres
        try
        {
            await stateStore.ExpireExecutionAsync(execution.Id, TimeSpan.FromHours(48), ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to set Redis TTL for finished execution {ExecutionId}", execution.Id);
        }

        logger.LogInformation("Pipeline Execution [{ExecutionId}] completed successfully with Parameters snapshot.", execution.Id);
        return Result.Ok(execution);
    }

    private async Task<JsonDocument> CaptureExecutionStateSnapshotAsync(
        PipelineExecution execution,
        CancellationToken ct
    )
    {
        var parametersSnapshot = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var inputsDict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var variablesDict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var outputsDict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var contextDict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        // 1. Inputs
        if (execution.Pipeline?.Parameters != null)
        {
            var inputParams = execution.Pipeline.Parameters
                .Where(p => p.Kind == PipelineParameterKind.Input);

            foreach (var p in inputParams)
            {
                var val = await memoryStore.GetStartInputAsync(execution.Id, p.Key, ct);
                inputsDict[p.Key] = val ?? p.DefaultValue;
            }
        }

        // 2. Variables
        if (execution.Pipeline?.Parameters != null)
        {
            var varParams = execution.Pipeline.Parameters
                .Where(p => p.Kind == PipelineParameterKind.Variable);

            foreach (var p in varParams)
            {
                var val = await memoryStore.GetVariableAsync(execution.Id, p.Key, ct);
                variablesDict[p.Key] = val ?? p.DefaultValue;
            }
        }

        // 3. Outputs (from Return node or from memory store)
        if (execution.Pipeline?.Parameters != null)
        {
            var outParams = execution.Pipeline.Parameters
                .Where(p => p.Kind == PipelineParameterKind.Output);

            var returnNode = execution.Pipeline.Nodes.FirstOrDefault(n =>
                n.Kind == PipelineNodeKind.Return ||
                string.Equals(n.RefId, "Return", StringComparison.OrdinalIgnoreCase));

            if (returnNode != null)
            {
                var returnOutputs = await memoryStore.GetNodeAllOutputsAsync(execution.Id, returnNode.Id, ct: ct);
                foreach (var p in outParams)
                {
                    if (returnOutputs.TryGetValue(p.Key, out var outVal))
                    {
                        outputsDict[p.Key] = outVal;
                    }
                    else
                    {
                        var incomingEdge = execution.Pipeline.Edges.FirstOrDefault(e =>
                            e.TargetPipelineNodeId == returnNode.Id &&
                            string.Equals(e.TargetPin, p.Key, StringComparison.OrdinalIgnoreCase));

                        if (incomingEdge != null)
                        {
                            var srcVal = await memoryStore.GetNodePinValueAsync(execution.Id, incomingEdge.SourcePipelineNodeId, incomingEdge.SourcePin, ct: ct);
                            outputsDict[p.Key] = srcVal;
                        }
                    }
                }
            }
        }

        // 4. Context
        if (execution.Pipeline != null)
        {
            contextDict["projectId"] = execution.Pipeline.ProjectId;
            contextDict["triggerType"] = execution.Pipeline.TriggerType.ToString();
            if (execution.Pipeline.TriggerConfig != null)
            {
                contextDict["triggerConfig"] = execution.Pipeline.TriggerConfig;
            }
        }

        parametersSnapshot["inputs"] = inputsDict;
        parametersSnapshot["variables"] = variablesDict;
        parametersSnapshot["outputs"] = outputsDict;
        parametersSnapshot["context"] = contextDict;

        // 5. Node Executions & Live Outputs from Redis Hot State
        var nodeExecutionsList = new List<object>();
        var nodeOutputsDict = new Dictionary<string, Dictionary<string, object?>>(StringComparer.OrdinalIgnoreCase);

        if (execution.Pipeline?.Nodes != null)
        {
            foreach (var node in execution.Pipeline.Nodes)
            {
                var status = await stateStore.GetNodeStatusAsync(execution.Id, node.Id, ct);
                var outputs = await stateStore.GetNodeAllOutputsAsync(execution.Id, node.Id, ct);

                if (status != null || outputs.Count > 0)
                {
                    nodeExecutionsList.Add(new
                    {
                        nodeId = node.Id,
                        status = status ?? ExecutionStatus.Succeeded.ToString(),
                        output = outputs.Count > 0 ? outputs : null
                    });
                }

                if (outputs.Count > 0)
                {
                    nodeOutputsDict[node.Id.ToString()] = outputs;
                }
            }
        }

        var fullState = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["parameters"] = parametersSnapshot,
            ["nodeExecutions"] = nodeExecutionsList,
            ["nodeOutputs"] = nodeOutputsDict
        };

        return JsonDocument.Parse(JsonSerializer.Serialize(fullState));
    }
}
