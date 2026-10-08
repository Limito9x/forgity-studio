using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.DataResolver.Resolvers;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.Orchestrator.Dispatchers;

public class ForEachDispatcher(
    PipelineDbContext db,
    IPinValueResolver pinResolver,
    IExecutionMemoryStore memoryStore,
    IExecutionStateStore stateStore,
    DotNetSegmentDispatcher dotNetDispatcher,
    ILogger<ForEachDispatcher> logger,
    IHubContext<PipelineExecutionHub>? hubContext = null,
    Engine.EntityStore.IExecutionEntityStore? entityStore = null
)
{
    public async Task<Result> DispatchAsync(
        PipelineExecution execution,
        ExecSegment segment,
        ScopeContext? parentScope,
        IPipelineOrchestrator? orchestrator = null,
        CancellationToken ct = default
    )
    {
        var step = segment.Steps.FirstOrDefault();
        if (step == null) return Result.Ok();

        // 0. Mark ForEach node as Running and broadcast
        await RecordNodeRunningAsync(execution.Id, execution.PipelineId, step.NodeId, ct);

        // 1. Pull the input Array on-demand
        var arrayVal = await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "Array", parentScope, ct)
                       ?? await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "Collection", parentScope, ct)
                       ?? await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "Items", parentScope, ct);

        var items = ExtractItemsAsList(arrayVal);
        logger.LogInformation("ForEach Node [{NodeLabel}] ({NodeId}) pulled {Count} items to iterate.",
            step.Label, step.NodeId, items.Count);

        if (items.Count == 0)
        {
            logger.LogWarning("ForEach Node [{NodeLabel}] ({NodeId}): Input Array is empty (0 items). Loop body will be skipped.",
                step.Label, step.NodeId);
        }

        // 1b. Batch prefetch any resource entities in items array into ExecutionEntityStore
        if (entityStore != null && items.Count > 0)
        {
            var candidateGuids = new List<Guid>();
            foreach (var it in items)
            {
                var (_, parsedGuid, isValid) = EntityRefHelper.Parse(it);
                if (isValid && parsedGuid != Guid.Empty)
                {
                    candidateGuids.Add(parsedGuid);
                }
            }

            if (candidateGuids.Count > 0)
            {
                await entityStore.PrefetchResourcesAsync(candidateGuids, ct);
            }
        }

        var resultList = new List<object?>();
        var resultMap = new Dictionary<string, object?>();

        // 2. Iterate through items with isolated ScopeContext
        logger.LogInformation("ForEach [{NodeLabel}]: Starting iteration loop. BodyPlan has {SegCount} segments.",
            step.Label, segment.BodyPlan?.Segments.Count ?? 0);

        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
            logger.LogInformation("ForEach [{NodeLabel}]: >>> Iteration {Index}/{Total} | Item = {Item}",
                step.Label, i, items.Count, item);

            var iterScope = (parentScope ?? new ScopeContext("root"))
                .BuildChildScope($"foreach_{step.NodeId:N}", iterationIndex: i);

            iterScope.SetValue("Item", item);
            iterScope.SetValue("Index", i);
            iterScope.SetValue("Value", item);

            // Execute BodyPlan segments in this iteration
            if (segment.BodyPlan != null)
            {
                foreach (var bodySeg in segment.BodyPlan.Segments)
                {
                    logger.LogInformation("ForEach [{NodeLabel}] iter {Index}: Executing body segment [{Executor}] steps={Steps}",
                        step.Label, i, bodySeg.Executor, bodySeg.Steps.Count);

                    if (bodySeg.Executor == "dotNet")
                    {
                        Result segRes;
                        try
                        {
                            segRes = await dotNetDispatcher.DispatchAsync(execution, bodySeg, iterScope, orchestrator, ct);
                        }
                        catch (Exception ex)
                        {
                            var exMsg = $"ForEach body segment threw unhandled exception at iteration {i}: {ex.GetType().Name}: {ex.Message}";
                            logger.LogError(ex, exMsg);
                            await RecordNodeFailedAsync(execution.Id, execution.PipelineId, step.NodeId, exMsg, ct);
                            return Result.Fail(exMsg);
                        }

                        if (segRes.IsFailed)
                        {
                            var errMsg = segRes.Errors.FirstOrDefault()?.Message ?? "Step in ForEach body failed";
                            logger.LogError("ForEach [{NodeLabel}] iter {Index}: Body segment FAILED: {Error}", step.Label, i, errMsg);
                            await RecordNodeFailedAsync(execution.Id, execution.PipelineId, step.NodeId, errMsg, ct);
                            return segRes;
                        }

                        logger.LogInformation("ForEach [{NodeLabel}] iter {Index}: Body segment succeeded.", step.Label, i);
                    }
                    else
                    {
                        logger.LogWarning("ForEach [{NodeLabel}] iter {Index}: Body segment executor '{Executor}' is not dotNet - skipped!",
                            step.Label, i, bodySeg.Executor);
                    }
                }
            }
            else
            {
                logger.LogWarning("ForEach [{NodeLabel}] iter {Index}: BodyPlan is NULL - no body to execute.", step.Label, i);
            }

            // Collect Yield value for this iteration
            object? yieldVal;
            try
            {
                yieldVal = await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "YieldValue", iterScope, ct)
                           ?? await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "Yield", iterScope, ct)
                           ?? await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "Yield_Value", iterScope, ct);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "ForEach [{NodeLabel}] iter {Index}: Failed to resolve Yield pin (non-fatal).", step.Label, i);
                yieldVal = null;
            }

            if (yieldVal != null)
            {
                resultList.Add(yieldVal);
                if (yieldVal is IDictionary<string, object?> dObj)
                {
                    foreach (var (k, v) in dObj) resultMap[k] = v;
                }
                else if (yieldVal is IDictionary<string, string> dStr)
                {
                    foreach (var (k, v) in dStr) resultMap[k] = v;
                }
                else if (yieldVal is JsonElement el && el.ValueKind == JsonValueKind.Object)
                {
                    foreach (var prop in el.EnumerateObject())
                    {
                        resultMap[prop.Name] = InlineConfigResolver.NormalizeJsonElement(prop.Value);
                    }
                }
                else
                {
                    resultMap[i.ToString()] = yieldVal;
                }
            }

            logger.LogInformation("ForEach [{NodeLabel}]: Iteration {Index} completed.", step.Label, i);
        }

        logger.LogInformation("ForEach [{NodeLabel}]: All {Total} iterations done. ResultList={RCount}, ResultMap={MCount}",
            step.Label, items.Count, resultList.Count, resultMap.Count);

        // 3. Save aggregated outputs to Memory Store (ResultArray, Result, ResultMap, Count)
        var outputs = new Dictionary<string, object?>
        {
            ["ResultArray"] = resultList,
            ["Result"] = resultMap.Count > 0 && resultList.All(x => x is IDictionary || (x is JsonElement je && je.ValueKind == JsonValueKind.Object)) ? resultMap : resultList,
            ["ResultMap"] = resultMap,
            ["ExportMap"] = resultMap,
            ["Map"] = resultMap,
            ["Count"] = items.Count
        };

        await memoryStore.SetNodeAllOutputsAsync(execution.Id, step.NodeId, outputs, parentScope, ct);

        // 4. Mark node success in state store and broadcast
        await RecordNodeSuccessAsync(execution.Id, execution.PipelineId, step.NodeId, outputs, ct);
        return Result.Ok();
    }

    private async Task RecordNodeRunningAsync(Guid executionId, Guid pipelineId, Guid nodeId, CancellationToken ct)
    {
        await stateStore.SetNodeStatusAsync(executionId, nodeId, "running", ct);

        if (hubContext != null)
        {
            try
            {
                await hubContext.Clients.Group($"pipeline_{pipelineId}").SendAsync(
                    "PipelineNodeExecutionUpdated",
                    new
                    {
                        executionId,
                        pipelineId,
                        nodeId,
                        status = "running",
                        startedAt = DateTimeOffset.UtcNow
                    },
                    ct
                );
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to broadcast PipelineNodeExecutionUpdated via SignalR for {NodeId}", nodeId);
            }
        }
    }

    private async Task RecordNodeSuccessAsync(Guid executionId, Guid pipelineId, Guid nodeId, Dictionary<string, object?> outputs, CancellationToken ct)
    {
        await stateStore.SetNodeStatusAsync(executionId, nodeId, "succeeded", ct);
        await stateStore.SetNodeOutputsAsync(executionId, nodeId, outputs, ct);

        if (hubContext != null)
        {
            try
            {
                await hubContext.Clients.Group($"pipeline_{pipelineId}").SendAsync(
                    "PipelineNodeExecutionUpdated",
                    new
                    {
                        executionId,
                        pipelineId,
                        nodeId,
                        status = "succeeded",
                        finishedAt = DateTimeOffset.UtcNow,
                        outputs
                    },
                    ct
                );
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to broadcast PipelineNodeExecutionUpdated via SignalR for {NodeId}", nodeId);
            }
        }
    }

    private async Task RecordNodeFailedAsync(Guid executionId, Guid pipelineId, Guid nodeId, string error, CancellationToken ct)
    {
        await stateStore.SetNodeStatusAsync(executionId, nodeId, "failed", ct);

        if (hubContext != null)
        {
            try
            {
                await hubContext.Clients.Group($"pipeline_{pipelineId}").SendAsync(
                    "PipelineNodeExecutionUpdated",
                    new
                    {
                        executionId,
                        pipelineId,
                        nodeId,
                        status = "failed",
                        finishedAt = DateTimeOffset.UtcNow,
                        error
                    },
                    ct
                );
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to broadcast PipelineNodeExecutionUpdated via SignalR for {NodeId}", nodeId);
            }
        }
    }

    private static List<object?> ExtractItemsAsList(object? raw)
    {
        var result = new List<object?>();
        if (raw == null) return result;

        if (raw is string str && str.TrimStart().StartsWith('['))
        {
            try
            {
                var list = JsonSerializer.Deserialize<List<object?>>(str);
                if (list != null) return list;
            }
            catch { }
        }

        if (raw is JsonElement jsonElem)
        {
            if (jsonElem.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in jsonElem.EnumerateArray())
                {
                    result.Add(item.ValueKind switch
                    {
                        JsonValueKind.String => item.GetString(),
                        JsonValueKind.Number => item.TryGetInt64(out var l) ? l : item.GetDouble(),
                        JsonValueKind.True => true,
                        JsonValueKind.False => false,
                        JsonValueKind.Null or JsonValueKind.Undefined => null,
                        _ => item.GetRawText()
                    });
                }
                return result;
            }

            if (jsonElem.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in jsonElem.EnumerateObject())
                {
                    result.Add(prop.Value.GetString() ?? prop.Value.GetRawText());
                }
                return result;
            }
        }

        if (raw is IEnumerable enumerable && raw is not string && raw is not IDictionary)
        {
            foreach (var item in enumerable)
            {
                result.Add(item);
            }
            return result;
        }

        if (raw is IDictionary dict)
        {
            foreach (DictionaryEntry entry in dict)
            {
                result.Add(entry.Value);
            }
            return result;
        }

        // Single item fallback
        result.Add(raw);
        return result;
    }
}
