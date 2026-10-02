using System.Text.Json;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.DataResolver;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Grpc;
using Automation.Pipeline.Infrastructure.Persistence;
using Grpc.Core;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Features.Execution;

public class ExecutionStateGrpcService(
    IPinValueResolver pinResolver,
    IExecutionMemoryStore memoryStore,
    IExecutionStateStore legacyStateStore,
    PipelineDbContext db,
    ILogger<ExecutionStateGrpcService> logger
) : ExecutionStateService.ExecutionStateServiceBase
{
    public override async Task<GetStepInputsResponse> GetStepInputs(
        GetStepInputsRequest request,
        ServerCallContext context
    )
    {
        var response = new GetStepInputsResponse { Success = true };

        if (!Guid.TryParse(request.PipelineExecutionId, out var pipelineExecId) ||
            !Guid.TryParse(request.StepExecutionId, out var stepNodeId))
        {
            return new GetStepInputsResponse
            {
                Success = false,
                ErrorMessage = $"Invalid PipelineExecutionId '{request.PipelineExecutionId}' or StepExecutionId '{request.StepExecutionId}'."
            };
        }

        try
        {
            // 1. Build ScopeContext if provided
            ScopeContext? scope = null;
            if (!string.IsNullOrEmpty(request.ScopeId) && !string.Equals(request.ScopeId, "root", StringComparison.OrdinalIgnoreCase))
            {
                scope = new ScopeContext(request.ScopeId, iterationIndex: request.IterationIndex >= 0 ? request.IterationIndex : null);
            }

            // 1. Resolve explicit input mappings if provided
            if (request.InputMappings != null && request.InputMappings.Count > 0)
            {
                foreach (var mapping in request.InputMappings)
                {
                    var pinKey = mapping.PinKey;
                    if (string.Equals(mapping.SourceKind, "literal", StringComparison.OrdinalIgnoreCase) &&
                        !string.IsNullOrEmpty(mapping.LiteralValueJson))
                    {
                        response.InputsJson[pinKey] = mapping.LiteralValueJson;
                        continue;
                    }

                    var resolved = await pinResolver.ResolvePinAsync(
                        pipelineExecId,
                        stepNodeId,
                        pinKey,
                        scope,
                        context.CancellationToken
                    );

                    if (resolved != null)
                    {
                        response.InputsJson[pinKey] = resolved is string s && (s.StartsWith('{') || s.StartsWith('['))
                            ? s
                            : JsonSerializer.Serialize(resolved);
                    }
                }
            }

            // 2. Also resolve all remaining pins defined on the node (wires, configs, assets, start inputs)
            var allInputs = await pinResolver.ResolveAllPinsAsync(
                pipelineExecId,
                stepNodeId,
                scope: scope,
                ct: context.CancellationToken
            );

            foreach (var (k, v) in allInputs)
            {
                if (v != null && !response.InputsJson.ContainsKey(k))
                {
                    response.InputsJson[k] = v is string s && (s.StartsWith('{') || s.StartsWith('['))
                        ? s
                        : JsonSerializer.Serialize(v);
                }
            }

            return response;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to resolve step inputs via gRPC for step {StepId}", request.StepExecutionId);
            return new GetStepInputsResponse
            {
                Success = false,
                ErrorMessage = ex.Message
            };
        }
    }

    public override async Task<ReportStepOutputResponse> ReportStepOutput(
        ReportStepOutputRequest request,
        ServerCallContext context
    )
    {
        if (!Guid.TryParse(request.PipelineExecutionId, out var pipelineExecId) ||
            !Guid.TryParse(request.StepExecutionId, out var stepNodeId))
        {
            return new ReportStepOutputResponse
            {
                Success = false,
                ErrorMessage = "Invalid PipelineExecutionId or StepExecutionId."
            };
        }

        try
        {
            ScopeContext? scope = null;
            if (!string.IsNullOrEmpty(request.ScopeId) && !string.Equals(request.ScopeId, "root", StringComparison.OrdinalIgnoreCase))
            {
                scope = new ScopeContext(request.ScopeId, iterationIndex: request.IterationIndex >= 0 ? request.IterationIndex : null);
            }

            var outputsDict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

            foreach (var (pinKey, jsonVal) in request.OutputsJson)
            {
                object? parsed = null;
                try
                {
                    parsed = JsonSerializer.Deserialize<JsonElement>(jsonVal);
                }
                catch
                {
                    parsed = jsonVal;
                }

                outputsDict[pinKey] = parsed;

                // 1. Save to Memory Store (Scoped Redis)
                await memoryStore.SetNodePinValueAsync(
                    pipelineExecId,
                    stepNodeId,
                    pinKey,
                    parsed,
                    scope,
                    context.CancellationToken
                );

                // 2. Save to Legacy State Store for backward compatibility
                await legacyStateStore.SetNodeOutputAsync(
                    pipelineExecId,
                    stepNodeId,
                    pinKey,
                    parsed,
                    context.CancellationToken
                );
            }

            // 3. Update Node status in Redis
            await legacyStateStore.SetNodeStatusAsync(pipelineExecId, stepNodeId, ExecutionStatus.Succeeded.ToString(), context.CancellationToken);

            logger.LogInformation("Reported step outputs successfully for node {NodeId} in execution {ExecId}",
                stepNodeId, pipelineExecId);

            return new ReportStepOutputResponse { Success = true };
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to report step output for step {StepId}", request.StepExecutionId);
            return new ReportStepOutputResponse
            {
                Success = false,
                ErrorMessage = ex.Message
            };
        }
    }
}
