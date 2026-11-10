using System.Text.Json;
using Automation.Pipeline.BuildTime.Features.Authoring;
using Automation.Pipeline.BuildTime.Features.Authoring.Dtos;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Runtime.Planner.Models;
using Automation.Pipeline.Runtime.State;
using Wolverine.Attributes;

namespace Automation.Pipeline.Runtime.Features.Execution;

public record DraftScriptItemDto(
    string Key,
    string FileName,
    string FullPath,
    string? ScriptContent,
    string ContentHash,
    string? Executor,
    List<PinDefinition> Inputs,
    List<PinDefinition> Outputs,
    List<ScriptDependencyDto>? Dependencies = null
);

public record DraftPipelineGraphDto(
    List<SavePipelineNodeItem> Nodes,
    List<SavePipelineEdgeItem> Edges,
    List<PipelineParameter>? Parameters = null
);

public record RunDraftPipelineRequest(
    Guid ProjectId,
    string Name,
    DraftPipelineGraphDto GraphData,
    List<DraftScriptItemDto> LocalScripts,
    Guid? PreferredRunnerId = null,
    Dictionary<string, object?>? RuntimeInputs = null
);

public record RunDraftPipelineCommand(
    Guid ProjectId,
    string Name,
    DraftPipelineGraphDto GraphData,
    List<DraftScriptItemDto> LocalScripts,
    Guid? PreferredRunnerId = null,
    Dictionary<string, object?>? RuntimeInputs = null
);

public class RunDraftPipelineValidator : AbstractValidator<RunDraftPipelineCommand>
{
    public RunDraftPipelineValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.GraphData).NotNull();
    }
}

public class RunDraftPipelineEndpoint(IMessageBus bus)
    : Endpoint<RunDraftPipelineRequest, PipelineExecutionDto>
{
    public override void Configure()
    {
        Post("run-draft");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d =>
            d.Produces<PipelineExecutionDto>(200).Produces(400).Produces(422)
        );
    }

    public override async Task HandleAsync(RunDraftPipelineRequest req, CancellationToken ct)
    {
        var cmd = new RunDraftPipelineCommand(
            req.ProjectId,
            req.Name,
            req.GraphData,
            req.LocalScripts,
            req.PreferredRunnerId,
            req.RuntimeInputs
        );

        var result = await bus.InvokeAsync<Result<PipelineExecutionDto>>(cmd, ct);

        if (result.IsFailed)
        {
            var unresolvedError = result.Errors.OfType<UnresolvedPinsError>().FirstOrDefault();
            if (unresolvedError != null)
            {
                HttpContext.Response.StatusCode = 422;
                await HttpResponseJsonExtensions.WriteAsJsonAsync(
                    HttpContext.Response,
                    new
                    {
                        error = "UNRESOLVED_PINS",
                        message = unresolvedError.Message,
                        unresolvedPins = unresolvedError.UnresolvedPins,
                        diagnostics = unresolvedError.Diagnostics
                    },
                    cancellationToken: ct
                );
                return;
            }
        }

        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class RunDraftPipelineHandler(
    IMessageBus bus,
    IExecutionStateStore stateStore,
    IPipelineContractValidator contractValidator,
    ITransientPipelineGraphFactory transientGraphFactory
)
{
    public async Task<Result<PipelineExecutionDto>> HandleAsync(
        RunDraftPipelineCommand command,
        CancellationToken ct
    )
    {
        var pipelineName = string.IsNullOrWhiteSpace(command.Name) ? "Draft Pipeline" : command.Name;
        var basePipeline = new Automation.Pipeline.Domain.Entities.Pipeline(command.ProjectId, pipelineName)
        {
            Id = Guid.NewGuid()
        };

        var transientPipeline = transientGraphFactory.BuildFromDraftSnapshot(
            basePipeline,
            command.GraphData?.Nodes ?? [],
            command.GraphData?.Edges ?? [],
            command.GraphData?.Parameters
        );

        // 1. Preflight Validation
        var validationResult = await contractValidator.ValidateGraphAsync(transientPipeline, ct: ct);
        if (!validationResult.IsValid)
        {
            var unresolvedPins = validationResult.UnresolvedPins
                .Select(u => new UnresolvedPin(
                    Guid.TryParse(u.NodeId, out var g) ? g : Guid.Empty,
                    u.NodeLabel,
                    u.PinName,
                    u.PinName,
                    PinPrimitiveType.String,
                    "Unresolved required input pin"
                ))
                .ToList();

            var firstError = validationResult.Diagnostics
                .FirstOrDefault(d => d.Severity == PipelineDiagnosticSeverity.Error)?.Message
                ?? "Draft pipeline graph validation failed.";

            return Result.Fail<PipelineExecutionDto>(
                new UnresolvedPinsError(firstError, unresolvedPins, validationResult.Diagnostics)
            );
        }

        // 2. Map LocalScripts to Transient NodeDefinitions with Direct Disk Paths
        var transientDefs = command.LocalScripts?.Select(s =>
        {
            var def = new NodeDefinition(
                command.ProjectId,
                s.FileName,
                s.Key,
                s.Key,
                string.IsNullOrWhiteSpace(s.Executor) ? "python" : s.Executor,
                s.Inputs ?? [],
                s.Outputs ?? []
            )
            {
                ContentHash = s.ContentHash,
                Dependencies = s.Dependencies ?? []
            };
            def.SetSourceRepositoryPath(s.FullPath);
            return def;
        }).ToList() ?? [];

        // 3. Initialize Ephemeral PipelineExecutionState (Zero-DB Write)
        var executionId = Guid.NewGuid();
        var initialState = new PipelineExecutionState
        {
            IsDraft = true,
            ExecutionId = executionId,
            ProjectId = command.ProjectId,
            PipelineId = transientPipeline.Id,
            PipelineName = transientPipeline.Name,
            Status = ExecutionStatus.Pending,
            TransientGraphData = transientPipeline.GraphData,
            TransientNodeDefinitions = transientDefs,
            PreferredRunnerId = command.PreferredRunnerId,
            StartedAt = DateTimeOffset.UtcNow
        };

        if (command.RuntimeInputs != null)
        {
            foreach (var (k, v) in command.RuntimeInputs)
            {
                initialState.RuntimeInputs[k] = v;
            }
        }

        // Persist only in Redis / Memory store with 2-hour TTL
        await stateStore.SaveFullStateAsync(executionId, initialState, ct);
        await stateStore.ExpireExecutionAsync(executionId, TimeSpan.FromHours(2), ct);

        // 4. Publish Wolverine trigger message
        await bus.PublishAsync(new TriggerPipelineExecutionMessage(executionId, command.RuntimeInputs));

        return Result.Ok(new PipelineExecutionDto(
            executionId,
            transientPipeline.Id,
            ExecutionStatus.Pending,
            initialState.StartedAt,
            null,
            null,
            0,
            null,
            initialState.ToJsonDocument()
        ));
    }
}
