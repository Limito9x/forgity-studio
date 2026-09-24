using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.StructRegistry;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Features.Pipelines;

public record AddPipelineNodeCommand(
    Guid PipelineId,
    string RefId,
    string Kind,
    float PositionX,
    float PositionY,
    Dictionary<string, object?>? ConfigValues = null
);

public record AddPipelineNodeRequest(
    Guid PipelineId,
    string RefId,
    string Kind,
    float PositionX,
    float PositionY,
    Dictionary<string, object?>? ConfigValues = null
);

public class AddPipelineNodeEndpoint : Endpoint<AddPipelineNodeRequest, PipelineNodeGraphDto>
{
    public override void Configure()
    {
        Post("{PipelineId:guid}/nodes");
        Group<PipelinesGroup>();
        AllowAnonymous();
    }

    public override async Task HandleAsync(AddPipelineNodeRequest req, CancellationToken ct)
    {
        var command = req.Adapt<AddPipelineNodeCommand>();
        var result = await Resolve<IMessageBus>().InvokeAsync<Result<PipelineNodeGraphDto>>(command, ct);
        await this.SendResultAsync(result, ct);
    }
}

[Transactional(typeof(PipelineDbContext))]
public class AddPipelineNodeHandler(
    PipelineDbContext db,
    IToolRegistry toolRegistry,
    IEntityStructRegistry structRegistry
)
{
    public async Task<Result<PipelineNodeGraphDto>> HandleAsync(
        AddPipelineNodeCommand command,
        CancellationToken ct
    )
    {
        var pipeline = await db.Pipelines
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == command.PipelineId, ct);

        if (pipeline == null)
        {
            return Result.Fail<PipelineNodeGraphDto>($"Pipeline '{command.PipelineId}' not found.");
        }

        JsonDocument? configDoc = null;
        if (command.ConfigValues != null && command.ConfigValues.Count > 0)
        {
            configDoc = JsonDocument.Parse(JsonSerializer.Serialize(command.ConfigValues));
        }

        var node = new PipelineNode(
            Guid.NewGuid(),
            command.PipelineId,
            command.RefId,
            command.Kind,
            command.PositionX,
            command.PositionY,
            configDoc
        );

        await db.PipelineNodes.AddAsync(node, ct);
        await db.SaveChangesAsync(ct);

        // Resolve definitions for DTO
        IReadOnlyList<PinDefinition> inputs = [];
        IReadOnlyList<PinDefinition> outputs = [];
        string label = node.RefId;
        string? category = null;
        string? executor = null;

        // 1. Check in ToolRegistry first (for all BuiltIn tools)
        var tool = toolRegistry.Get(node.RefId);
        if (tool != null)
        {
            var ctx = new PinResolutionContext(structRegistry, pipeline.ProjectId, pipeline.Variables);
            var (pInputs, pOutputs) = FlowPinHelper.WithExecPinsResolved(tool, command.ConfigValues, ctx);
            inputs = pInputs;
            outputs = pOutputs;
            label = !string.IsNullOrWhiteSpace(tool.Label) ? tool.Label : tool.Key;
            category = tool.Category ?? "Tools";
            executor = "builtin";
        }
        else
        {
            // 2. Check in Project NodeDefinitions
            var def = await db.NodeDefinitions
                .AsNoTracking()
                .FirstOrDefaultAsync(x =>
                    x.ProjectId == pipeline.ProjectId &&
                    (x.Key == node.RefId || x.Id.ToString() == node.RefId || x.Name == node.RefId),
                    ct
                );

            if (def != null)
            {
                var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(def);
                inputs = pInputs;
                outputs = pOutputs;
                label = !string.IsNullOrWhiteSpace(def.Label) ? def.Label : def.Name;
                category = "Custom";
                executor = def.Executor;
            }
        }

        var nodeDto = new PipelineNodeGraphDto(
            node.Id,
            node.RefId,
            node.Kind,
            label,
            category,
            executor,
            node.Position,
            inputs,
            outputs,
            command.ConfigValues
        );

        return Result.Ok(nodeDto);
    }
}
