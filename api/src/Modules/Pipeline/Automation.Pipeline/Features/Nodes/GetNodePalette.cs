using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Features.Nodes;

public record GetNodePaletteQuery(
    Guid? ProjectId = null,
    string? Executor = null
);

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
    private static readonly HashSet<string> HiddenToolKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "Start",
        "BeginExecute",
        // 23 Zombie / 0-usage tools cleaned from Palette:
        "ForEachLoop",
        "MakeMap",
        "GetMapItem",
        "SetMapItem",
        "GetMapKeys",
        "GetMapValues",
        "MergeMaps",
        "ZipToMap",
        "RemapKeys",
        "GetArrayItem",
        "GetCollectionCount",
        "FilterArray",
        "SortArray",
        "SliceArray",
        "Aggregate",
        "Branch",
        "Switch",
        "Select",
        "GetVariable",
        "SetVariable",
        "AssignTag",
        "InspectModel",
        "GetTagValueFromInspection"
    };

    public async Task<Result<IReadOnlyList<NodePaletteItemDto>>> HandleAsync(
        GetNodePaletteQuery query,
        CancellationToken ct
    )
    {
        var result = new List<NodePaletteItemDto>();

        // 1. Built-in Tools from ToolRegistry (excluding hidden / zombie tools)
        var builtInTools = toolRegistry.GetAll();
        foreach (var tool in builtInTools)
        {

            var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(tool);
            var category = tool.Category ?? "Tools";
            var capabilities = ResolveCapabilities(tool);
            result.Add(new NodePaletteItemDto(
                tool.Key,
                tool.Label,
                category,
                Constants.PipelineNodeKind.Tool.ToString(),
                "builtin",
                pInputs,
                pOutputs,
                null,
                tool.Description,
                tool.IsDynamic,
                capabilities,
                IsVisibleInPalette: !HiddenToolKeys.Contains(tool.Key)
            ));
        }

        // Return Node (Pipeline Output / End of Execution)
        var (returnInputs, returnOutputs) = FlowPinHelper.WithExecPins(Constants.PipelineNodeKind.Return, isPure: false, [], []);
        result.Add(new NodePaletteItemDto(
            "Return",
            "Return",
            "Flow Control",
            Constants.PipelineNodeKind.Return.ToString(),
            "builtin",
            returnInputs,
            returnOutputs,
            null,
            "Defines the final outputs and completes the execution of the pipeline graph."
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
                node.Id,
                null
            ));
        }

        // 3. Sub-Pipelines from DB (Only include if explicitly requested via executor == "macro")
        if (query.ProjectId.HasValue)
        {
            var pipelines = await db.Pipelines
                .AsNoTracking()
                .Where(p => p.ProjectId == query.ProjectId.Value)
                .OrderBy(p => p.Name)
                .ToListAsync(ct);

            foreach (var p in pipelines)
            {
                var subInputs = p.Parameters
                    .Where(param => param.Kind == Domain.Enums.PipelineParameterKind.Input)
                    .OrderBy(i => i.Order)
                    .Select(i => new PinDefinition
                    {
                        Id = i.Key,
                        Label = i.Label,
                        Kind = PinKind.Data,
                        PrimitiveType = i.Type,
                        Cardinality = i.Cardinality,
                        StructType = i.StructType,
                        IsRequired = i.IsRequired,
                        DefaultValue = i.DefaultValue
                    }).ToList();

                var subOutputs = p.Parameters
                    .Where(param => param.Kind == Domain.Enums.PipelineParameterKind.Output)
                    .OrderBy(i => i.Order)
                    .Select(i => new PinDefinition
                    {
                        Id = i.Key,
                        Label = i.Label,
                        Kind = PinKind.Data,
                        PrimitiveType = i.Type,
                        Cardinality = i.Cardinality,
                        StructType = i.StructType
                    }).ToList();

                var (pInputs, pOutputs) = FlowPinHelper.WithExecPins(Constants.PipelineNodeKind.SubPipeline, isPure: false, subInputs, subOutputs);

                result.Add(new NodePaletteItemDto(
                    p.Id.ToString(),
                    p.Name,
                    "Pipelines",
                    Constants.PipelineNodeKind.SubPipeline.ToString(),
                    "builtin",
                    pInputs,
                    pOutputs,
                    p.Id,
                    null
                ));
            }
        }

        return Result.Ok<IReadOnlyList<NodePaletteItemDto>>(result);
    }

    public static NodeCapabilitiesDto? ResolveCapabilities(IResolverTool? tool)
    {
        if (tool == null) return null;

        var caps = tool.Capabilities ?? (tool.IsDynamic ? new NodeCapabilities(ViewVariant: "Standard") : null);
        if (caps == null) return null;

        return new NodeCapabilitiesDto(
            CanAddPin: caps.CanAddPin,
            CanRemovePin: caps.CanRemovePin,
            PinAddMode: caps.PinAddMode,
            InspectorMode: caps.InspectorMode,
            RuleNotes: caps.RuleNotes,
            ViewVariant: caps.ViewVariant,
            ProtectedPinIds: caps.ProtectedPinIds,
            SchemaConfigKeys: caps.SchemaConfigKeys
        );
    }
}

public record NodeCapabilitiesDto(
    bool CanAddPin = false,
    bool CanRemovePin = false,
    string? PinAddMode = null,
    string? InspectorMode = null,
    string? RuleNotes = null,
    string ViewVariant = "Standard",
    IReadOnlyList<string>? ProtectedPinIds = null,
    IReadOnlyList<string>? SchemaConfigKeys = null
);

public record NodePaletteItemDto(
    string Key,
    string Label,
    string Category,
    string Source, // "BuiltIn" | "Custom"
    string Executor,
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs,
    Guid? Id = null,
    string? Description = null,
    bool IsDynamic = false,
    NodeCapabilitiesDto? Capabilities = null,
    bool IsVisibleInPalette = true
);
