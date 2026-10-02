using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Files.Contracts;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public class RunPipelineEndpoint(IMessageBus bus) : Endpoint<RunPipelineRequest, PipelineExecutionDto>
{
    public override void Configure()
    {
        Post("{pipelineId:guid}/run");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d
            .Produces<PipelineExecutionDto>(200)
            .Produces(400)
            .Produces(422)
            .Produces(404));
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
                        unresolvedPins = unresolvedError.UnresolvedPins
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
    IPipelineExecutionEngine executionEngine,
    IAssetApi assetApi
)
{
    public async Task<Result<PipelineExecutionDto>> HandleAsync(
        RunPipelineCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .Include(x => x.Nodes)
            .FirstOrDefaultAsync(x => x.Id == command.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineExecutionDto>($"Pipeline '{command.PipelineId}' not found.");
        }

        // 1. Validate required Start Inputs
        var requiredMissing = pipeline.Parameters
            .Where(p => p.Kind == Domain.Enums.PipelineParameterKind.Input && p.IsRequired && p.DefaultValue == null)
            .Where(i => command.RuntimeInputs == null ||
                        (!command.RuntimeInputs.ContainsKey(i.Key) && !command.RuntimeInputs.ContainsKey(i.Label)))
            .ToList();

        if (requiredMissing.Count > 0)
        {
            var missingLabels = string.Join(", ", requiredMissing.Select(i => $"'{i.Label}' ({i.Key})"));
            return Result.Fail<PipelineExecutionDto>($"Missing required pipeline start input(s): {missingLabels}.");
        }

        // 2. Create Execution record and pre-save initial RuntimeInputs in ExecutionState
        var execution = new PipelineExecution(pipeline.Id);

        var initialState = new Automation.Pipeline.Engine.Models.PipelineExecutionState();
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
            await PipelineAssetHelper.LinkRuntimeInputAssetsAsync(assetApi, execution.Id, command.RuntimeInputs, null, ct);
        }

        // 3. Trigger Execution Engine asynchronously (Direct in-process invocation)
        var executionId = execution.Id;
        var inputs = command.RuntimeInputs;
        _ = Task.Run(async () =>
        {
            try
            {
                await executionEngine.ExecuteOrResumeAsync(executionId, inputs);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Pipeline Execution {executionId} Error] {ex.Message}");
            }
        });

        var dto = new PipelineExecutionDto(
            execution.Id,
            execution.PipelineId,
            execution.AgentId,
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
