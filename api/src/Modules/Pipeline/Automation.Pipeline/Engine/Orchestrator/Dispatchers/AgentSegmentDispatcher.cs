using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Hubs;
using Automation.Runner.Contracts;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.Orchestrator.Dispatchers;

public class AgentSegmentDispatcher(
    IMessageBus messageBus,
    IRunnerApi runnerApi,
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
                StepType = step.Kind.ToString(),
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

        // Determine effective Runner ID from Stage TargetRunnerId (Single Source of Truth)
        var effectiveRunnerId = segment.TargetRunnerId ?? Guid.Empty;
        if (effectiveRunnerId == Guid.Empty)
        {
            var err = $"Worker Stage '{segment.StageName ?? segment.StageId?.ToString()}' ({segment.Executor}) cannot be dispatched because no Runner was assigned.";
            logger.LogError(err);
            return Result.Fail(err);
        }

        // Fetch Environment Config for Executor (e.g. blender executable path, unreal engine uproject)
        var envConfig = new Dictionary<string, object?>();
        var configResult = await runnerApi.GetExecutorConfigAsync(
            effectiveRunnerId,
            segment.Executor,
            ct
        );

        if (configResult != null && configResult.IsSuccess && configResult.Value != null)
        {
            var config = configResult.Value;
            if (!string.IsNullOrWhiteSpace(config.ExecutablePath))
            {
                envConfig["executablePath"] = config.ExecutablePath;
            }

            if (config.Settings != null)
            {
                try
                {
                    var parsedSettings = JsonSerializer.Deserialize<Dictionary<string, object?>>(config.Settings.RootElement.GetRawText()) ?? [];
                    foreach (var (k, v) in parsedSettings)
                    {
                        envConfig[k] = v;
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "Failed to parse executor settings for {Executor}", segment.Executor);
                }
            }

            // Auto-resolve Unreal project path for the current project if executor is unreal
            if (segment.Executor.Equals("unreal", StringComparison.OrdinalIgnoreCase))
            {
                if (envConfig.TryGetValue("registeredProjects", out var regObj) && regObj != null)
                {
                    var projIdStr = execution.Pipeline.ProjectId.ToString();
                    string? projectPath = null;

                    if (regObj is JsonElement jsonElem && jsonElem.ValueKind == JsonValueKind.Object)
                    {
                        if (jsonElem.TryGetProperty(projIdStr, out var prop))
                        {
                            projectPath = prop.GetString();
                        }
                    }
                    else if (regObj is IDictionary<string, object?> dict && dict.TryGetValue(projIdStr, out var val))
                    {
                        projectPath = val?.ToString();
                    }

                    if (!string.IsNullOrWhiteSpace(projectPath))
                    {
                        envConfig["projectPath"] = projectPath;
                        logger.LogInformation("Resolved Unreal Engine project path for Project {ProjectId}: {ProjectPath}",
                            execution.Pipeline.ProjectId, projectPath);
                    }
                    else
                    {
                        logger.LogWarning("Runner {RunnerId} has no registered Unreal project for Project {ProjectId}",
                            effectiveRunnerId, execution.Pipeline.ProjectId);
                    }
                }
            }
        }

        var grpcEndpoint = configuration["AppConfig:GrpcEndpoint"]
                           ?? configuration["GrpcEndpoint"]
                           ?? "http://127.0.0.1:50051";

        var stageTask = new StageTaskMessage
        {
            StageExecutionId = stageId,
            PipelineExecutionId = execution.Id.ToString(),
            StageId = segment.StageId?.ToString() ?? stageId,
            Executor = segment.Executor,
            GrpcEndpoint = grpcEndpoint,
            Steps = steps,
            ResolvedData = [], // Worker pulls via gRPC on demand
            EnvironmentConfig = envConfig
        };

        execution.MarkWaitingForRunner(stageId, nextSegmentIndex, execution.ExecutionState ?? JsonDocument.Parse("{}"));

        logger.LogInformation("Dispatching Agent Segment [{StageId}] ({StageName}) with {StepCount} steps to {Executor} (Runner: {RunnerId})",
            stageId, segment.StageName ?? "Unscoped", steps.Count, segment.Executor, effectiveRunnerId);

        if (effectiveRunnerId != Guid.Empty)
        {
            var queueName = $"stage_tasks.{effectiveRunnerId}";
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
                            new
                            {
                                executionId = execution.Id,
                                pipelineId = execution.PipelineId,
                                nodeId = nId,
                                status = "running",
                                startedAt = DateTimeOffset.UtcNow
                            },
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
