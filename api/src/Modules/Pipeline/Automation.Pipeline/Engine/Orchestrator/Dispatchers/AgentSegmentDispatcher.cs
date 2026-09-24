using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Hubs;
using Automation.Studio.Contracts;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.Orchestrator.Dispatchers;

public class AgentSegmentDispatcher(
    IMessageBus messageBus,
    IStudioApi studioApi,
    IAssetApi assetApi,
    IConfiguration configuration,
    ILogger<AgentSegmentDispatcher> logger,
    IPinValueResolver? pinResolver = null,
    IHubContext<PipelineExecutionHub>? hubContext = null
)
{
    public async Task<Result> DispatchAsync(
        PipelineExecution execution,
        ExecSegment segment,
        int nextSegmentIndex,
        IReadOnlyList<NodeDefinition> customDefinitions,
        ScopeContext? scope = null,
        CancellationToken ct = default
    )
    {
        var stageId = $"stage_{Guid.NewGuid():N}";
        var customDefsLookup = customDefinitions
            .GroupBy(x => x.Id.ToString())
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        var customDefsKeyLookup = customDefinitions
            .Where(x => !string.IsNullOrEmpty(x.Key))
            .GroupBy(x => x.Key)
            .ToDictionary(g => g.Key, g => g.First(), StringComparer.OrdinalIgnoreCase);

        // Batch resolve script assets for custom node definitions (if any)
        var customDefIds = customDefinitions.Select(d => d.Id.ToString()).Distinct().ToList();
        Dictionary<string, IReadOnlyList<AssetLinkDto>> assetsByDefId = [];
        if (customDefIds.Count > 0)
        {
            try
            {
                var assetsResult = await assetApi.GetFilesAsync(customDefIds, "NodeDefinition", PipelineAssetSlots.CustomScript, ct);
                if (assetsResult.IsSuccess && assetsResult.Value != null)
                {
                    assetsByDefId = assetsResult.Value;
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to query script assets for custom node definitions");
            }
        }

        var steps = new List<StepExecution>();
        for (var i = 0; i < segment.Steps.Count; i++)
        {
            var step = segment.Steps[i];
            NodeDefinition? def = null;
            if (customDefsLookup.TryGetValue(step.RefId, out var foundDef) ||
                customDefsKeyLookup.TryGetValue(step.RefId, out foundDef))
            {
                def = foundDef;
            }

            var inputMappings = step.IncomingConnections.Select(c => new StepInputMapping
            {
                PinKey = c.TargetPinKey,
                SourceKind = "node_output",
                SourceNodeId = c.SourceNodeId.ToString(),
                SourcePinKey = c.SourcePinKey
            }).ToList();

            // 1. Initial fallback inputs from inline node config (if any)
            var initialInputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            if (step.Config != null && step.Config.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in step.Config.RootElement.EnumerateObject())
                {
                    initialInputs[prop.Name] = Automation.Pipeline.Engine.DataResolver.Resolvers.InlineConfigResolver.NormalizeJsonElement(prop.Value);
                }
            }

            // 2. Pre-resolve all incoming pins via pinResolver (e.g. BreakStruct, MakeMap, pure nodes, or prior outputs)
            if (pinResolver != null)
            {
                try
                {
                    var resolvedPins = await pinResolver.ResolveAllPinsAsync(
                        execution.Id,
                        step.NodeId,
                        scope: scope,
                        ct: ct
                    );

                    foreach (var (k, v) in resolvedPins)
                    {
                        if (v != null)
                        {
                            initialInputs[k] = v;
                        }
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "AgentSegmentDispatcher: Failed to resolve pin inputs for step {StepLabel} [{StepId}]", step.Label, step.NodeId);
                }
            }

            string? scriptUrl = null;
            string? scriptHash = null;
            string? entryPoint = null;

            if (def != null && assetsByDefId.TryGetValue(def.Id.ToString(), out var assetList))
            {
                var asset = assetList.FirstOrDefault();
                if (asset != null)
                {
                    scriptUrl = asset.PublicUrl;
                    scriptHash = asset.AssetId.ToString();
                    entryPoint = asset.OriginalName;
                }
            }

            steps.Add(new StepExecution
            {
                StepExecutionId = step.NodeId.ToString(),
                StepType = step.Kind,
                Name = step.Label,
                ScriptPath = def != null && !string.IsNullOrEmpty(def.Key) ? def.Key : step.RefId,
                ScriptUrl = scriptUrl,
                ScriptHash = scriptHash,
                EntryPoint = entryPoint,
                Order = i,
                InputMappings = inputMappings,
                Inputs = initialInputs
            });

            logger.LogInformation("AgentSegmentDispatcher: Step #{Order} ({Name}) [{StepId}] prepared (ScriptUrl: {HasUrl}, ScriptHash: {Hash})",
                i, step.Label, step.NodeId, !string.IsNullOrEmpty(scriptUrl), scriptHash);
        }

        // Fetch Environment Config for Executor (e.g. blender executable path, unreal engine port)
        var envConfig = new Dictionary<string, object?>();
        var configResult = await studioApi.GetExecutorConfigAsync(
            execution.Pipeline.ProjectId,
            execution.AgentId,
            segment.Executor,
            ct
        );

        if (configResult != null && configResult.IsSuccess && configResult.Value?.Settings != null)
        {
            try
            {
                envConfig = JsonSerializer.Deserialize<Dictionary<string, object?>>(configResult.Value.Settings.RootElement.GetRawText()) ?? [];
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to parse executor settings for {Executor}", segment.Executor);
            }
        }

        var grpcEndpoint = configuration["AppConfig:GrpcEndpoint"]
                           ?? configuration["GrpcEndpoint"]
                           ?? "http://127.0.0.1:50051";

        var stageTask = new StageTaskMessage
        {
            StageExecutionId = stageId,
            PipelineExecutionId = execution.Id.ToString(),
            StageId = stageId,
            Executor = segment.Executor,
            GrpcEndpoint = grpcEndpoint,
            Steps = steps,
            ResolvedData = [], // Worker pulls via gRPC on demand
            EnvironmentConfig = envConfig
        };

        execution.MarkWaitingForAgent(stageId, nextSegmentIndex, execution.ExecutionState ?? JsonDocument.Parse("{}"));

        logger.LogInformation("Dispatching Agent Segment [{StageId}] with {StepCount} steps to {Executor}",
            stageId, steps.Count, segment.Executor);

        if (execution.AgentId != Guid.Empty)
        {
            var queueName = $"stage_tasks.{execution.AgentId}";
            logger.LogInformation("Routing StageTaskMessage to targeted agent queue: {QueueName}", queueName);
            var endpointUri = new Uri($"rabbitmq://queue/{queueName}");
            var endpoint = messageBus.EndpointFor(endpointUri);
            await endpoint.SendAsync(stageTask);
        }
        else
        {
            await messageBus.PublishAsync(stageTask);
        }

        if (hubContext != null)
        {
            try
            {
                foreach (var s in steps)
                {
                    if (Guid.TryParse(s.StepExecutionId, out var nId))
                    {
                        await hubContext.Clients.Group($"pipeline_{execution.PipelineId}").SendAsync(
                            "PipelineNodeExecutionUpdated",
                            new { executionId = execution.Id, pipelineId = execution.PipelineId, nodeId = nId },
                            ct
                        );
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to broadcast PipelineNodeExecutionUpdated for dispatched agent steps");
            }
        }

        return Result.Ok();
    }
}
