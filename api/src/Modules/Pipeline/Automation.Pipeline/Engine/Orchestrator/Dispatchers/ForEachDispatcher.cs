using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.DataResolver.Resolvers;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.Orchestrator.Dispatchers;

public class ForEachDispatcher(
    PipelineDbContext db,
    IPinValueResolver pinResolver,
    IExecutionMemoryStore memoryStore,
    IExecutionStateStore stateStore,
    DotNetSegmentDispatcher dotNetDispatcher,
    ILogger<ForEachDispatcher> logger
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

        // 1. Pull the input Array on-demand
        var arrayVal = await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "Array", parentScope, ct)
                       ?? await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "Collection", parentScope, ct)
                       ?? await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "Items", parentScope, ct);

        var items = ExtractItemsAsList(arrayVal);
        logger.LogInformation("ForEach Node [{NodeLabel}] ({NodeId}) pulled {Count} items to iterate.",
            step.Label, step.NodeId, items.Count);

        var resultList = new List<object?>();
        var resultMap = new Dictionary<string, object?>();

        // 2. Iterate through items with isolated ScopeContext
        for (var i = 0; i < items.Count; i++)
        {
            var item = items[i];
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
                    if (bodySeg.Executor == "dotNet")
                    {
                        var segRes = await dotNetDispatcher.DispatchAsync(execution, bodySeg, iterScope, orchestrator, ct);
                        if (segRes.IsFailed)
                        {
                            return segRes;
                        }
                    }
                }
            }

            // Collect Yield value for this iteration
            var yieldVal = await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "YieldValue", iterScope, ct)
                           ?? await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "Yield", iterScope, ct)
                           ?? await pinResolver.ResolvePinAsync(execution.Id, step.NodeId, "Yield_Value", iterScope, ct);

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
        }

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

        // 4. Mark node success in state store
        await stateStore.SetNodeStatusAsync(execution.Id, step.NodeId, "succeeded", ct);
        await stateStore.SetNodeOutputsAsync(execution.Id, step.NodeId, outputs, ct);
        return Result.Ok();
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
