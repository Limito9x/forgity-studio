using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Features.Nodes;

public record GetNodePaletteQuery(Guid? ProjectId = null);

public class GetNodePaletteEndpoint(IMessageBus bus)
    : Endpoint<GetNodePaletteQuery, IReadOnlyList<NodePaletteItemDto>>
{
    public override void Configure()
    {
        Get("palette");
        Group<NodesGroup>();
        Description(x => x.WithName("GetNodePalette"));
        Permissions(P.Pipeline.GetAll);
    }

    public override async Task HandleAsync(GetNodePaletteQuery req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<IReadOnlyList<NodePaletteItemDto>>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class GetNodePaletteHandler(IToolRegistry toolRegistry, PipelineDbContext db)
{
    public async Task<Result<IReadOnlyList<NodePaletteItemDto>>> HandleAsync(
        GetNodePaletteQuery query,
        CancellationToken ct
    )
    {
        var result = new List<NodePaletteItemDto>();

        // 1. Built-in Tools from ToolRegistry
        var builtInTools = toolRegistry.GetAll();
        foreach (var tool in builtInTools)
        {
            if (string.Equals(tool.Key, "Start", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(tool.Key, "BeginExecute", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(tool);
            var category = tool.Category ?? "Tools";
            result.Add(new NodePaletteItemDto(
                tool.Key,
                tool.Label,
                category,
                "BuiltIn",
                "builtin",
                pInputs,
                pOutputs,
                null
            ));
        }

        // Return Node (Pipeline Output / End of Execution)
        var (returnInputs, returnOutputs) = FlowPinHelper.WithExecPins(Constants.PipelineNodeKind.Return, isPure: false, [], []);
        result.Add(new NodePaletteItemDto(
            "Return",
            "Return",
            "Flow Control",
            Constants.PipelineNodeKind.Return,
            "builtin",
            returnInputs,
            returnOutputs,
            null
        ));

        // 2. Custom User NodeDefinitions from DB
        var customNodesQuery = db.NodeDefinitions.AsNoTracking();
        if (query.ProjectId.HasValue)
        {
            customNodesQuery = customNodesQuery.Where(x => x.ProjectId == query.ProjectId.Value);
        }

        var customNodes = await customNodesQuery
            .OrderBy(x => x.Name)
            .ToListAsync(ct);

        foreach (var node in customNodes)
        {
            var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(node);
            result.Add(new NodePaletteItemDto(
                node.Key,
                node.Label,
                "Custom",
                "Custom",
                node.Executor,
                pInputs,
                pOutputs,
                node.Id
            ));
        }

        // 3. Sub-Pipelines from DB (Pipelines in the same Project)
        if (query.ProjectId.HasValue)
        {
            var pipelines = await db.Pipelines
                .AsNoTracking()
                .Include(p => p.Inputs)
                .Include(p => p.Outputs)
                .Where(p => p.ProjectId == query.ProjectId.Value)
                .OrderBy(p => p.Name)
                .ToListAsync(ct);

            foreach (var p in pipelines)
            {
                var subInputs = p.Inputs.OrderBy(i => i.Order).Select(i => new PinDefinition
                {
                    Id = i.Key,
                    Label = i.Label,
                    Kind = PinKind.Data,
                    PrimitiveType = i.Type,
                    Cardinality = i.Cardinality,
                    IsRequired = i.IsRequired,
                    DefaultValue = i.DefaultValue
                }).ToList();

                var subOutputs = p.Outputs.OrderBy(i => i.Order).Select(i => new PinDefinition
                {
                    Id = i.Key,
                    Label = i.Label,
                    Kind = PinKind.Data,
                    PrimitiveType = i.Type,
                    Cardinality = i.Cardinality
                }).ToList();

                var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(Constants.PipelineNodeKind.SubPipeline, isPure: false, subInputs, subOutputs);

                result.Add(new NodePaletteItemDto(
                    p.Id.ToString(),
                    p.Name,
                    "Pipelines",
                    Constants.PipelineNodeKind.SubPipeline,
                    "builtin",
                    pInputs,
                    pOutputs,
                    p.Id
                ));
            }
        }

        return Result.Ok<IReadOnlyList<NodePaletteItemDto>>(result);
    }
}

public record NodePaletteItemDto(
    string Key,
    string Label,
    string Category,
    string Source, // "BuiltIn" | "Custom"
    string Executor,
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs,
    Guid? Id = null
);
