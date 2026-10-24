using Microsoft.Extensions.DependencyInjection;
using Automation.Files.Contracts;
using System.Text.Json;
using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Pipeline.Contracts.StructRegistry;
using Automation.Pipeline.Contracts.Tools;
namespace Automation.Pipeline.BuildTime.Graph;

public interface IPipelineGraphDtoBuilder
{
    Task<PipelineGraphDto> BuildDtoAsync(Domain.Entities.Pipeline pipeline, CancellationToken ct = default,
        bool hydrateFiles = true);
    Task<PipelineGraphDto> HydrateFilesAsync(PipelineGraphDto graph, CancellationToken ct = default);
}

public class PipelineGraphDtoBuilder : IPipelineGraphDtoBuilder
{
    private readonly INodeContractResolver _contractResolver;
    private readonly IAssetApi _assetApi;
    private readonly IPipelineContractValidator? _contractValidator;

    [ActivatorUtilitiesConstructor]
    public PipelineGraphDtoBuilder(
        INodeContractResolver contractResolver,
        IAssetApi assetApi,
        IPipelineContractValidator? contractValidator = null
    )
    {
        _contractResolver = contractResolver;
        _assetApi = assetApi;
        _contractValidator = contractValidator;
    }

    public static PipelineGraphDtoBuilder Create(
        PipelineDbContext? db,
        IToolRegistry toolRegistry,
        IEntityStructRegistry structRegistry,
        IAssetApi assetApi
    ) => new(
        new PipelineNodeContractResolver(db!, toolRegistry, structRegistry),
        assetApi,
        new PipelineContractValidator(new PipelineNodeContractResolver(db!, toolRegistry, structRegistry), structRegistry)
    );

    public async Task<PipelineGraphDto> BuildDtoAsync(
        Domain.Entities.Pipeline pipeline,
        CancellationToken ct = default,
        bool hydrateFiles = true
    )
    {
        var context = await _contractResolver.BuildContextAsync(pipeline, ct);
        var contracts = _contractResolver.ResolveAllNodes(pipeline.Nodes, context);

        var nodeDtos = new List<PipelineNodeGraphDto>();

        foreach (var node in pipeline.Nodes)
        {
            var contract = contracts[node.Id];

            nodeDtos.Add(new PipelineNodeGraphDto(
                node.Id,
                node.RefId,
                node.Kind,
                contract.Label,
                contract.Category,
                contract.Executor,
                node.Position,
                contract.Inputs,
                contract.Outputs,
                contract.ConfigValues,
                node.ParentId,
                node.Size,
                contract.Metadata,
                FileAssets: null
            ));
        }

        var edgeDtos = pipeline.Edges.Select(e => new PipelineEdgeGraphDto(
            e.Id,
            e.SourcePipelineNodeId,
            e.SourcePin,
            e.TargetPipelineNodeId,
            e.TargetPin,
            e.Kind
        )).ToList();

        var parameterDtos = (pipeline.Parameters ?? []).OrderBy(p => p.Order).Select(p => new PipelineParameterDto(
            p.Id,
            p.Key,
            p.Label,
            p.Kind,
            p.Type,
            p.Cardinality,
            p.StructType,
            p.IsRequired,
            p.DefaultValue,
            p.Description,
            p.Order,
            p.ContextData
        )).ToList();

        IReadOnlyList<PipelineDiagnostic>? diagnostics = null;
        if (_contractValidator != null)
        {
            var valResult = await _contractValidator.ValidateGraphAsync(pipeline, context, contracts, ct);
            diagnostics = valResult.Diagnostics;
        }

        var graph = new PipelineGraphDto(
            pipeline.Id,
            pipeline.ProjectId,
            pipeline.Name,
            pipeline.TriggerType,
            nodeDtos,
            edgeDtos,
            parameterDtos,
            pipeline.TriggerConfig,
            Diagnostics: diagnostics
        );
        return hydrateFiles ? await HydrateFilesAsync(graph, ct) : graph;
    }

    public async Task<PipelineGraphDto> HydrateFilesAsync(PipelineGraphDto graph, CancellationToken ct = default)
    {
        var references = graph.Nodes.SelectMany(n => PipelineFileValue.References(n.Id,
            n.ConfigValues == null ? null : JsonSerializer.SerializeToDocument(n.ConfigValues))).ToList();
        var filesById = new Dictionary<Guid, AssetLinkDto>();
        if (references.Count > 0)
        {
            var files = await _assetApi.FindLinksByIdsAsync(references, ct);
            if (files.IsSuccess) filesById = files.Value.ToDictionary(x => x.AssetLinkId);
        }
        var nodeDtos = graph.Nodes.Select(n =>
        {
            var fileAssets = new PipelineNodeFileMap();
            foreach (var pin in n.Inputs.Where(PipelineFileValue.IsFilePin))
            {
                if (n.ConfigValues?.TryGetValue(pin.Id, out var value) != true || value == null) continue;
                if (PipelineFileValue.TryGetLinkId(value, out var linkId))
                {
                    fileAssets[pin.Id] = filesById.TryGetValue(linkId, out var file)
                        ? new(linkId, file.AssetId, file.OriginalName, file.ContentType, file.SizeBytes, "Available", file.HashSha256)
                        : new(linkId, null, null, null, null, "Unavailable");
                }
                else if (PipelineFileValue.TryGetUnbound(value, out var unboundInfo) && unboundInfo != null)
                {
                    fileAssets[pin.Id] = new(
                        null,
                        null,
                        unboundInfo.OriginalFileName,
                        unboundInfo.ContentType,
                        unboundInfo.SizeBytes,
                        "Unbound",
                        unboundInfo.HashSha256
                    );
                }
                else if (PipelineFileValue.AsJson(value).ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.ToString()))
                    fileAssets[pin.Id] = new(null, null, null, null, null, "RequiresRelink");
            }

            // Also check any unbound pins in ConfigValues that may not be listed in n.Inputs
            if (n.ConfigValues != null)
            {
                foreach (var (k, v) in n.ConfigValues)
                {
                    if (fileAssets.ContainsKey(k)) continue;
                    if (PipelineFileValue.TryGetUnbound(v, out var unboundInfo) && unboundInfo != null)
                    {
                        fileAssets[k] = new(
                            null,
                            null,
                            unboundInfo.OriginalFileName,
                            unboundInfo.ContentType,
                            unboundInfo.SizeBytes,
                            "Unbound",
                            unboundInfo.HashSha256
                        );
                    }
                }
            }

            return n with { FileAssets = fileAssets };
        }).ToList();

        return graph with { Nodes = nodeDtos };
    }
}
