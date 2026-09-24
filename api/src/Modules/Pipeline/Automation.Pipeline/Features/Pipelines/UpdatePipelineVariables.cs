using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public record UpdatePipelineVariablesCommand(
    Guid PipelineId,
    List<PipelineVariableDto> Variables
);

public record UpdatePipelineVariablesRequest(
    Guid PipelineId,
    List<PipelineVariableDto> Variables
);

public class UpdatePipelineVariablesEndpoint : Endpoint<UpdatePipelineVariablesRequest, List<PipelineVariableDto>>
{
    public override void Configure()
    {
        Put("{PipelineId:guid}/variables");
        Group<PipelinesGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(UpdatePipelineVariablesRequest req, CancellationToken ct)
    {
        var command = new UpdatePipelineVariablesCommand(req.PipelineId, req.Variables);
        var result = await Resolve<IMessageBus>().InvokeAsync<Result<List<PipelineVariableDto>>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class UpdatePipelineVariablesHandler(
    PipelineDbContext db
)
{
    public async Task<Result<List<PipelineVariableDto>>> HandleAsync(
        UpdatePipelineVariablesCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .FirstOrDefaultAsync(x => x.Id == command.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<List<PipelineVariableDto>>($"Pipeline '{command.PipelineId}' not found.");
        }

        var decls = (command.Variables ?? new())
            .Select(v => new PipelineVariableDecl
            {
                Name = v.Name.Trim(),
                Type = v.Type,
                Cardinality = v.Cardinality,
                Description = v.Description,
                StructType = v.StructType
            })
            .ToList();

        pipeline.SetVariables(decls);
        await db.SaveChangesAsync(ct);

        var resultDtos = decls.Select(v => new PipelineVariableDto(
            v.Name,
            v.Type,
            v.Cardinality,
            v.Description,
            v.StructType
        )).ToList();

        return Result.Ok(resultDtos);
    }
}
