using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.Messages;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Engine.Orchestrator.Enrichers;
using Automation.Pipeline.Hubs;
using Automation.Runner.Contracts;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.Orchestrator.Dispatchers;

public class RunnerSegmentDispatcher(
    IMessageBus messageBus,
    IRunnerApi runnerApi,
    IAssetApi assetApi,
    IConfiguration configuration,
    ILogger<RunnerSegmentDispatcher> logger,
    IEnumerable<IExecutorEnvironmentEnricher>? enrichers = null,
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

        var usedDefs = segment.Steps.Select(step => customDefsLookup.GetValueOrDefault(step.RefId)
            ?? customDefsKeyLookup.GetValueOrDefault(step.RefId)).Where(x => x != null).DistinctBy(x => x!.Id).ToList();
        Dictionary<Guid, AssetLinkDto> scriptsById = [];
        if (usedDefs.Count > 0)
        {
            var scriptResult = await assetApi.GetFilesAsync(usedDefs.Select(x => x!.Id.ToString()),
                "NodeDefinition", PipelineAssetSlots.CustomScript, ct);
            if (scriptResult.IsFailed) return Result.Fail(scriptResult.Errors);
            foreach (var definition in usedDefs)
            {
                var files = scriptResult.Value.GetValueOrDefault(definition!.Id.ToString()) ?? [];
                var file = files.Count == 1 ? files[0] : null;
                if (file == null || string.IsNullOrWhiteSpace(file.HashSha256))
                    return Result.Fail($"Custom node '{definition.Key}' has no stored script matching its content. Reupload it before execution.");
                scriptsById[definition.Id] = file;
            }
        }

        // Map steps to StepExecution contracts for the Runner daemon
        var steps = new List<StepExecution>();
        for (int i = 0; i < segment.Steps.Count; i++)
        {
            var step = segment.Steps[i];
            NodeDefinition? def = null;
            if (
                customDefsLookup.TryGetValue(step.RefId, out var foundDef)
                || customDefsKeyLookup.TryGetValue(step.RefId, out foundDef)
            )
            {
                def = foundDef;
            }

            var inputMappings = step
                .IncomingConnections.Select(c => new StepInputMapping
                {
                    PinKey = c.TargetPinKey,
                    SourceKind = "node_output",
                    SourceNodeId = c.SourceNodeId.ToString(),
                    SourcePinKey = c.SourcePinKey,
                })
                .ToList();

            // 1. Initial fallback inputs from inline node config (if any)
            var initialInputs = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            if (step.Config != null && step.Config.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var prop in step.Config.RootElement.EnumerateObject())
                {
                    initialInputs[prop.Name] =
                        Automation.Pipeline.Engine.DataResolver.Resolvers.InlineConfigResolver.NormalizeJsonElement(
                            prop.Value
                        );
                }
            }

            // 2. Pre-resolve direct wires and pure node connections into inputs for the Runner
            if (pinResolver != null)
            {
                try
                {
                    var resolvedInputs = await pinResolver.ResolveAllPinsAsync(
                        execution.Id,
                        step.NodeId,
                        scope: scope,
                        ct: ct
                    );
                    foreach (var (k, v) in resolvedInputs)
                    {
                        if (v != null)
                        {
                            initialInputs[k] = v;
                        }
                    }
                }
                catch (Exception ex)
                {
                    if (ex is InvalidOperationException) throw;
                    logger.LogWarning(
                        ex,
                        "RunnerSegmentDispatcher: Failed to resolve pin inputs for step {StepLabel} [{StepId}]",
                        step.Label,
                        step.NodeId
                    );
                }
            }

            string? scriptUrl = null;
            string? scriptHash = null;
            string? entryPoint = null;

            if (def != null)
            {
                var file = scriptsById[def.Id];
                scriptUrl = file.PublicUrl;
                scriptHash = file.HashSha256;
                entryPoint = file.OriginalName;
            }

            steps.Add(
                new StepExecution
                {
                    StepExecutionId = step.NodeId.ToString(),
                    StepType = step.Kind.ToString(),
                    Name = step.Label,
                    ScriptPath = def != null ? entryPoint! : step.RefId,
                    ScriptUrl = scriptUrl,
                    ScriptHash = scriptHash,
                    EntryPoint = entryPoint,
                    Order = i,
                    InputMappings = inputMappings,
                    Inputs = initialInputs,
                }
            );

            logger.LogInformation(
                "RunnerSegmentDispatcher: Step #{Order} ({Name}) [{StepId}] prepared (ScriptUrl: {HasUrl}, ScriptHash: {Hash})",
                i,
                step.Label,
                step.NodeId,
                !string.IsNullOrEmpty(scriptUrl),
                scriptHash
            );
        }

        // Determine effective Runner ID from Stage TargetRunnerId (Single Source of Truth)
        var effectiveRunnerId = segment.TargetRunnerId ?? Guid.Empty;

        // Fallback 1: Thử resolve dynamic wire vào pin "runner" của Stage nếu có
        if (effectiveRunnerId == Guid.Empty && pinResolver != null && segment.StageId.HasValue)
        {
            foreach (var pinName in new[] { "runner", "Runner", "runnerid" })
            {
                try
                {
                    var resolvedRunner = await pinResolver.ResolvePinAsync(
                        execution.Id,
                        segment.StageId.Value,
                        pinName,
                        scope,
                        ct
                    );
                    if (resolvedRunner != null)
                    {
                        var (_, parsedGuid, isValid) = EntityRefHelper.Parse(resolvedRunner);
                        if (isValid && parsedGuid != Guid.Empty)
                        {
                            effectiveRunnerId = parsedGuid;
                            logger.LogInformation(
                                "RunnerSegmentDispatcher: Resolved Runner {RunnerId} on-demand via Stage pin '{PinName}'",
                                effectiveRunnerId,
                                pinName
                            );
                            break;
                        }
                    }
                }
                catch { }
            }
        }

        // Fallback 2: Thử lấy RunnerId từ ExecutionState RuntimeInputs nếu người dùng chọn runner lúc chạy pipeline
        if (effectiveRunnerId == Guid.Empty && execution.ExecutionState != null)
        {
            try
            {
                var doc = execution.ExecutionState;
                if (
                    doc.RootElement.TryGetProperty("RuntimeInputs", out var rInputs)
                    || doc.RootElement.TryGetProperty("runtimeInputs", out rInputs)
                )
                {
                    foreach (var prop in rInputs.EnumerateObject())
                    {
                        if (prop.Name.Contains("runner", StringComparison.OrdinalIgnoreCase))
                        {
                            var (_, parsedGuid, isValid) = EntityRefHelper.Parse(
                                prop.Value.GetString() ?? prop.Value.GetRawText()
                            );
                            if (isValid && parsedGuid != Guid.Empty)
                            {
                                effectiveRunnerId = parsedGuid;
                                logger.LogInformation(
                                    "RunnerSegmentDispatcher: Resolved Runner {RunnerId} from ExecutionState RuntimeInputs '{Key}'",
                                    effectiveRunnerId,
                                    prop.Name
                                );
                                break;
                            }
                        }
                    }
                }
            }
            catch { }
        }

        if (effectiveRunnerId == Guid.Empty)
        {
            var err = $"Worker Stage '{segment.StageName ?? segment.StageId?.ToString()}' ({segment.Executor}) cannot be dispatched because no Runner was assigned.";
            logger.LogError(err);
            return Result.Fail(err);
        }

        // Fetch Environment Config for Executor (e.g. blender executable path, unreal engine uproject)
        var envConfig = new Dictionary<string, object?>();
        RunnerExecutorConfigDto? config = null;
        try
        {
            var configResult = await runnerApi.GetExecutorConfigAsync(
                effectiveRunnerId,
                segment.Executor,
                ct
            );

            if (configResult != null && configResult.IsSuccess)
            {
                config = configResult.Value;
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Failed to retrieve executor config for runner {RunnerId}, executor {Executor}",
                effectiveRunnerId,
                segment.Executor
            );
        }

        if (config != null)
        {
            if (!string.IsNullOrWhiteSpace(config.ExecutablePath))
            {
                envConfig["executablePath"] = config.ExecutablePath;
            }

            if (config.Settings != null)
            {
                try
                {
                    var parsedSettings =
                        JsonSerializer.Deserialize<Dictionary<string, object?>>(
                            config.Settings.RootElement.GetRawText()
                        ) ?? [];
                    foreach (var (k, v) in parsedSettings)
                    {
                        envConfig[k] = v;
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(
                        ex,
                        "Failed to parse executor settings for {Executor}",
                        segment.Executor
                    );
                }
            }
        }

        // Apply Strategy Enrichers (Open/Closed Principle - No hardcoded engine logic in dispatcher)
        if (enrichers != null)
        {
            var enricher = enrichers.FirstOrDefault(e => e.Executor.Equals(segment.Executor, StringComparison.OrdinalIgnoreCase));
            if (enricher != null)
            {
                await enricher.EnrichAsync(envConfig, config, execution.Pipeline.ProjectId, effectiveRunnerId, ct);
            }
        }

        var grpcEndpoint =
            configuration["AppConfig:GrpcEndpoint"]
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
            EnvironmentConfig = envConfig,
        };

        execution.MarkWaitingForRunner(
            stageId,
            nextSegmentIndex,
            execution.ExecutionState ?? JsonDocument.Parse("{}")
        );

        logger.LogInformation(
            "Dispatching Runner Segment [{StageId}] ({StageName}) with {StepCount} steps to {Executor} (Runner: {RunnerId})",
            stageId,
            segment.StageName ?? "Unscoped",
            steps.Count,
            segment.Executor,
            effectiveRunnerId
        );

        if (effectiveRunnerId != Guid.Empty)
        {
            var queueName = $"stage_tasks.{effectiveRunnerId}";
            logger.LogInformation(
                "Routing StageTaskMessage to targeted runner queue: {QueueName}",
                queueName
            );
            var endpointUri = new Uri($"rabbitmq://queue/{queueName}");
            var endpoint = messageBus.EndpointFor(endpointUri);
            await endpoint.SendAsync(stageTask);
        }

        // Broadcast node states: transition from pending -> running for UI live inspector
        if (hubContext != null)
        {
            try
            {
                foreach (var s in steps)
                {
                    if (Guid.TryParse(s.StepExecutionId, out var nId))
                    {
                        await hubContext
                            .Clients.Group($"pipeline_{execution.PipelineId}")
                            .SendAsync(
                                "PipelineNodeExecutionUpdated",
                                new
                                {
                                    executionId = execution.Id,
                                    pipelineId = execution.PipelineId,
                                    nodeId = nId,
                                    status = "running",
                                    startedAt = DateTimeOffset.UtcNow,
                                },
                                ct
                            );
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(
                    ex,
                    "Failed to broadcast PipelineNodeExecutionUpdated for dispatched runner steps"
                );
            }
        }

        return Result.Ok();
    }
}
