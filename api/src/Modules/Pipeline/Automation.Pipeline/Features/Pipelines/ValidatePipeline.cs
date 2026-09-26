using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Features.Pipelines;

public class ValidatePipelineEndpoint(IMessageBus bus) : Endpoint<ValidatePipelineQuery, ValidatePipelineResponse>
{
    public override void Configure()
    {
        Post("{pipelineId:guid}/validate");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);

        Description(d => d
            .Produces<ValidatePipelineResponse>(200)
            .Produces(400)
            .Produces(404));
    }

    public override async Task HandleAsync(ValidatePipelineQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ValidatePipelineResponse>>(req, ct);
        await this.SendResultAsync(result, ct);
    }

}

[NonTransactional]
public class ValidatePipelineHandler(
    PipelineDbContext db,
    Engine.ExecPlanner.IExecPlanner planner,
    IToolRegistry toolRegistry
)
{
    public async Task<Result<ValidatePipelineResponse>> HandleAsync(
        ValidatePipelineQuery query,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .Include(p => p.Nodes)
            .Include(p => p.Edges)
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == query.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<ValidatePipelineResponse>($"Pipeline '{query.PipelineId}' not found.");
        }

        var customDefs = await db.NodeDefinitions
            .AsNoTracking()
            .Where(x => x.ProjectId == pipeline.ProjectId)
            .ToListAsync(ct);

        var result = planner.BuildExecPlan(
            pipeline,
            customDefs,
            toolRegistry,
            query.RuntimeInputs
        );

        return Result.Ok(new ValidatePipelineResponse(
            result.IsValid,
            result.CycleNodeIds,
            result.UnresolvedPins
        ));
    }
}
