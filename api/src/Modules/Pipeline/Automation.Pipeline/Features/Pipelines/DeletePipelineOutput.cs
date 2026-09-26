using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines.DeletePipelineOutput;

public record DeletePipelineOutputCommand(
    Guid PipelineId,
    Guid OutputId
);

[Transactional(typeof(PipelineDbContext))]
public class DeletePipelineOutputHandler(PipelineDbContext db)
{
    public async Task<Result> HandleAsync(
        DeletePipelineOutputCommand command,
        CancellationToken ct
    )
    {
        var output = await db.PipelineOutputs.FirstOrDefaultAsync(
            x => x.Id == command.OutputId && x.PipelineId == command.PipelineId,
            ct
        );

        if (output == null)
        {
            return Result.Fail($"Pipeline output with ID '{command.OutputId}' not found.");
        }

        db.PipelineOutputs.Remove(output);
        await db.SaveChangesAsync(ct);

        return Result.Ok();
    }
}

public class DeletePipelineOutputEndpoint(IMessageBus bus) : EndpointWithoutRequest
{
    public override void Configure()
    {
        Delete("{pipelineId:guid}/outputs/{outputId:guid}");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Update);
        Description(d => d
            .Produces(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var pipelineId = Route<Guid>("pipelineId");
        var outputId = Route<Guid>("outputId");
        var result = await bus.InvokeAsync<Result>(new DeletePipelineOutputCommand(pipelineId, outputId), ct);
        await this.SendResultAsync(result, ct);
    }
}
