using System.Text.Json;
using Automation.Files.Contracts;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Runtime.Planner.Models;
using Automation.Pipeline.Hubs;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;
namespace Automation.Pipeline.Runtime.Features.Execution;

public class RunPipelineEndpoint(IMessageBus bus)
    : Endpoint<RunPipelineRequest, PipelineExecutionDto>
{
    public override void Configure()
    {
        Post("{pipelineId:guid}/run");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d =>
            d.Produces<PipelineExecutionDto>(200).Produces(400).Produces(422).Produces(404)
        );
    }

    public override async Task HandleAsync(RunPipelineRequest req, CancellationToken ct)
    {
        var pipelineId = Route<Guid>("pipelineId");
        var cmd = new RunPipelineCommand(pipelineId, req.RuntimeInputs);
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
public class RunPipelineHandler(
    PipelineDbContext db,
    IMessageBus bus,
    IAssetApi assetApi,
    IPipelineContractValidator contractValidator
)
{
    public async Task<Result<PipelineExecutionDto>> HandleAsync(
        RunPipelineCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db
            .Pipelines
            .Include(p => p.Nodes)
            .Include(p => p.Edges)
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == command.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineExecutionDto>($"Pipeline '{command.PipelineId}' not found.");
        }

        if (pipeline.DeletedAt != null)
        {
            return Result.Fail<PipelineExecutionDto>(
                $"Pipeline '{pipeline.Name}' is archived and cannot be executed."
            );
        }

        if (!command.IsEventTrigger && pipeline.TriggerType != PipelineTriggerType.Manual)
        {
            return Result.Fail<PipelineExecutionDto>(
                $"Pipeline '{pipeline.Name}' is configured for trigger '{pipeline.TriggerType}' and cannot be executed manually."
            );
        }

        // 1. Validate required Start Inputs
        var requiredMissing = pipeline
            .Parameters.Where(p =>
                p.Kind == Domain.Enums.PipelineParameterKind.Input
                && p.IsRequired
                && p.DefaultValue == null
            )
            .Where(i =>
                command.RuntimeInputs == null
                || (
                    !command.RuntimeInputs.ContainsKey(i.Key)
                    && !command.RuntimeInputs.ContainsKey(i.Label)
                )
            )
            .ToList();

        if (requiredMissing.Count > 0)
        {
            var missingLabels = string.Join(
                ", ",
                requiredMissing.Select(i => $"'{i.Label}' ({i.Key})")
            );
            return Result.Fail<PipelineExecutionDto>(
                $"Missing required pipeline start input(s): {missingLabels}."
            );
        }

        // 2. Preflight Graph Validation: Chặn đứng nếu đồ thị đang dính lỗi Error hợp đồng
        var validationResult = await contractValidator.ValidateGraphAsync(pipeline, ct: ct);
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
                ?? "Pipeline graph validation failed.";

            return Result.Fail<PipelineExecutionDto>(
                new UnresolvedPinsError(firstError, unresolvedPins, validationResult.Diagnostics)
            );
        }

        // 3. Create Execution record and pre-save initial RuntimeInputs in ExecutionState
        var execution = new PipelineExecution(pipeline.Id);

        var initialState = new Automation.Pipeline.Runtime.Planner.Models.PipelineExecutionState();
        if (command.RuntimeInputs != null)
        {
            foreach (var (k, v) in command.RuntimeInputs)
            {
                initialState.RuntimeInputs[k] = v;
            }
        }
        execution.SetState(initialState.ToJsonDocument(), 0);

        db.PipelineExecutions.Add(execution);
        await db.SaveChangesAsync(ct);

        // Link any uploaded runtime input assets so they don't get cleaned up
        if (command.RuntimeInputs != null && command.RuntimeInputs.Count > 0)
        {
            await PipelineAssetHelper.LinkRuntimeInputAssetsAsync(
                assetApi,
                execution.Id,
                command.RuntimeInputs,
                null,
                ct
            );
        }

        // 4. Publish message to Wolverine durable background queue
        await bus.PublishAsync(
            new TriggerPipelineExecutionMessage(execution.Id, command.RuntimeInputs)
        );

        var dto = new PipelineExecutionDto(
            execution.Id,
            execution.PipelineId,
            execution.Status,
            execution.StartedAt,
            execution.FinishedAt,
            execution.ErrorMessage,
            execution.NextNodeIndex,
            execution.CurrentBatchId,
            execution.ExecutionState
        );

        return Result.Ok(dto);
    }
}
