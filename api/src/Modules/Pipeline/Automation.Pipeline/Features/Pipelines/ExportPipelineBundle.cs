using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine.Attributes;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Features.Pipelines.Services;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Files.Contracts;

namespace Automation.Pipeline.Features.Pipelines;

public record ExportPipelinesQuery(List<Guid> PipelineIds);

public class ExportPipelineEndpoint(IMessageBus bus) : EndpointWithoutRequest<PipelinePackageDto>
{
    public override void Configure()
    {
        Get("{id:guid}/export");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetById);
        Description(d => d
            .Produces<PipelinePackageDto>(200)
            .Produces(404));
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var pipelineId = Route<Guid>("id");
        var query = new ExportPipelinesQuery([pipelineId]);
        var result = await bus.InvokeAsync<Result<PipelinePackageDto>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

public class ExportPipelineBatchEndpoint(IMessageBus bus) : Endpoint<ExportPipelineBatchRequest, PipelinePackageDto>
{
    public override void Configure()
    {
        Post("export-batch");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.GetAll);
        Description(d => d
            .Produces<PipelinePackageDto>(200)
            .Produces(400));
    }

    public override async Task HandleAsync(ExportPipelineBatchRequest req, CancellationToken ct)
    {
        if (req.PipelineIds == null || req.PipelineIds.Count == 0)
        {
            await this.SendResultAsync(Result.Fail<PipelinePackageDto>("No pipeline IDs provided for batch export."), ct);
            return;
        }

        var query = new ExportPipelinesQuery(req.PipelineIds);
        var result = await bus.InvokeAsync<Result<PipelinePackageDto>>(query, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ExportPipelinesHandler(
    PipelineDbContext db,
    IPipelineGraphDtoBuilder graphDtoBuilder,
    IAssetApi assetApi,
    IHttpClientFactory httpClientFactory,
    ILogger<ExportPipelinesHandler> logger
)
{
    public async Task<Result<PipelinePackageDto>> HandleAsync(
        ExportPipelinesQuery query,
        CancellationToken ct
    )
    {
        var requestedIds = query.PipelineIds.Where(id => id != Guid.Empty).Distinct().ToList();
        if (requestedIds.Count == 0)
        {
            return Result.Fail<PipelinePackageDto>("At least one valid Pipeline ID must be provided.");
        }

        // 1. Recursive collection of Pipelines (Root & SubPipelines)
        var queue = new Queue<Guid>(requestedIds);
        var pipelineEntityMap = new Dictionary<Guid, Domain.Entities.Pipeline>();
        var graphDtoMap = new Dictionary<Guid, PipelineGraphDto>();
        var dependencyGraph = new Dictionary<Guid, HashSet<Guid>>(); // Parent -> Children (dependencies)

        while (queue.Count > 0)
        {
            var currentId = queue.Dequeue();
            if (pipelineEntityMap.ContainsKey(currentId))
            {
                continue;
            }

            var pipeline = await db.Pipelines
                .AsNoTracking()
                .Include(x => x.Nodes)
                .Include(x => x.Edges)
                .FirstOrDefaultAsync(x => x.Id == currentId, ct);

            if (pipeline == null)
            {
                if (requestedIds.Contains(currentId))
                {
                    return Result.Fail<PipelinePackageDto>($"Pipeline '{currentId}' was not found.");
                }
                continue;
            }

            pipelineEntityMap[currentId] = pipeline;
            dependencyGraph[currentId] = [];

            var graphDto = await graphDtoBuilder.BuildDtoAsync(pipeline, ct);
            graphDtoMap[currentId] = graphDto;

            // Scan nodes for SubPipeline dependencies
            foreach (var node in graphDto.Nodes.Where(n => n.Kind == PipelineNodeKind.SubPipeline))
            {
                Guid? childId = null;
                if (Guid.TryParse(node.RefId, out var parsedRef) && parsedRef != Guid.Empty)
                {
                    childId = parsedRef;
                }
                else if (node.ConfigValues != null &&
                         node.ConfigValues.TryGetValue("pipelineId", out var pVal) &&
                         Guid.TryParse(pVal?.ToString(), out var parsedConfig) &&
                         parsedConfig != Guid.Empty)
                {
                    childId = parsedConfig;
                }

                if (childId.HasValue && childId.Value != currentId)
                {
                    dependencyGraph[currentId].Add(childId.Value);
                    if (!pipelineEntityMap.ContainsKey(childId.Value))
                    {
                        queue.Enqueue(childId.Value);
                    }
                }
            }
        }

        // 2. Generate friendly, unique bundleIds
        var pipelineIdToBundleId = new Dictionary<Guid, string>();
        var usedBundleIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var (pId, p) in pipelineEntityMap)
        {
            var slug = Slugify(p.Name);
            var shortId = pId.ToString("N")[..6];
            var candidate = $"pl-{slug}-{shortId}";
            var counter = 1;
            while (!usedBundleIds.Add(candidate))
            {
                candidate = $"pl-{slug}-{shortId}-{counter++}";
            }
            pipelineIdToBundleId[pId] = candidate;
        }

        // 3. Topological Sort (DFS post-order) to calculate importOrder (Leaf-first)
        var orderedIds = new List<Guid>();
        var visited = new HashSet<Guid>();
        var visiting = new HashSet<Guid>();

        void Dfs(Guid u)
        {
            if (visited.Contains(u)) return;
            if (visiting.Contains(u))
            {
                logger.LogWarning("Cycle detected during package export for pipeline {PipelineId}. Skipping recursive branch.", u);
                return;
            }

            visiting.Add(u);

            if (dependencyGraph.TryGetValue(u, out var deps))
            {
                foreach (var v in deps)
                {
                    if (pipelineEntityMap.ContainsKey(v))
                    {
                        Dfs(v);
                    }
                }
            }

            visiting.Remove(u);
            visited.Add(u);
            orderedIds.Add(u); // Added AFTER all child dependencies
        }

        foreach (var id in pipelineEntityMap.Keys)
        {
            Dfs(id);
        }

        var importOrderMap = new Dictionary<Guid, int>();
        for (var i = 0; i < orderedIds.Count; i++)
        {
            importOrderMap[orderedIds[i]] = i + 1; // 1-indexed
        }

        // 4. Collect and Deduplicate Custom Scripts
        var customScriptsMap = new Dictionary<string, PipelinePackageScriptDto>(StringComparer.OrdinalIgnoreCase);
        var customNodeDefIds = new HashSet<Guid>();

        foreach (var (_, graphDto) in graphDtoMap)
        {
            foreach (var node in graphDto.Nodes.Where(n => n.Kind == PipelineNodeKind.Custom))
            {
                if (Guid.TryParse(node.RefId, out var defGuid))
                {
                    customNodeDefIds.Add(defGuid);
                }
            }
        }

        if (customNodeDefIds.Count > 0)
        {
            var nodeDefinitions = await db.NodeDefinitions
                .AsNoTracking()
                .Where(nd => customNodeDefIds.Contains(nd.Id))
                .ToListAsync(ct);

            var scriptFilesResult = await assetApi.GetFilesAsync(
                nodeDefinitions.Select(x => x.Id.ToString()),
                "NodeDefinition",
                PipelineAssetSlots.CustomScript,
                ct
            );

            var scriptFiles = scriptFilesResult.IsSuccess ? scriptFilesResult.Value : [];

            foreach (var def in nodeDefinitions)
            {
                var files = scriptFiles.GetValueOrDefault(def.Id.ToString()) ?? [];
                var file = files.FirstOrDefault();

                var contentHash = !string.IsNullOrWhiteSpace(file?.HashSha256)
                    ? file.HashSha256
                    : (!string.IsNullOrWhiteSpace(def.ContentHash) ? def.ContentHash : string.Empty);

                var scriptText = await FetchScriptContentAsync(file?.PublicUrl, ct);

                var scriptDto = new PipelinePackageScriptDto(
                    Key: def.Key,
                    Name: def.Name,
                    Label: def.Label,
                    Executor: def.Executor,
                    ContentHash: contentHash,
                    FileName: file?.OriginalName ?? $"{def.Key}.py",
                    ScriptContent: scriptText,
                    Inputs: def.Inputs,
                    Outputs: def.Outputs
                );

                customScriptsMap[def.Key] = scriptDto;
            }
        }

        // 5. Build PipelinePackageItemDto list
        var packagePipelines = new List<PipelinePackageItemDto>();

        foreach (var (pId, p) in pipelineEntityMap)
        {
            var graphDto = graphDtoMap[pId];
            var isRoot = requestedIds.Contains(pId);
            var bundleId = pipelineIdToBundleId[pId];
            var importOrder = importOrderMap.GetValueOrDefault(pId, 1);

            var directDeps = dependencyGraph[pId]
                .Where(childId => pipelineIdToBundleId.ContainsKey(childId))
                .Select(childId => pipelineIdToBundleId[childId])
                .OrderBy(x => x)
                .ToList();

            // Map nodes to package nodes with temporary IDs
            var nodeIdToTempId = new Dictionary<Guid, string>();
            foreach (var n in graphDto.Nodes)
            {
                nodeIdToTempId[n.Id] = $"node-{n.Id.ToString("N")[..8]}";
            }

            var packageNodes = graphDto.Nodes.Select(n =>
            {
                var tempId = nodeIdToTempId[n.Id];
                string? refPipelineBundleId = null;

                if (n.Kind == PipelineNodeKind.SubPipeline)
                {
                    Guid? childId = null;
                    if (Guid.TryParse(n.RefId, out var rId) && rId != Guid.Empty) childId = rId;
                    else if (n.ConfigValues != null &&
                             n.ConfigValues.TryGetValue("pipelineId", out var cVal) &&
                             Guid.TryParse(cVal?.ToString(), out var cId)) childId = cId;

                    if (childId.HasValue && pipelineIdToBundleId.TryGetValue(childId.Value, out var cBundleId))
                    {
                        refPipelineBundleId = cBundleId;
                    }
                }

                string? parentTempId = n.ParentId.HasValue && nodeIdToTempId.TryGetValue(n.ParentId.Value, out var ptId)
                    ? ptId
                    : null;

                // Clone config values, updating subpipeline reference if present
                Dictionary<string, object?>? cleanConfigValues = null;
                if (n.ConfigValues != null)
                {
                    cleanConfigValues = new Dictionary<string, object?>(n.ConfigValues);
                    if (refPipelineBundleId != null)
                    {
                        cleanConfigValues["pipelineBundleId"] = refPipelineBundleId;
                    }
                }

                return new PipelinePackageNodeDto(
                    TempId: tempId,
                    RefId: n.RefId,
                    Kind: n.Kind,
                    Label: n.Label,
                    Category: n.Category,
                    Executor: n.Executor,
                    Position: n.Position,
                    Inputs: n.Inputs,
                    Outputs: n.Outputs,
                    ConfigValues: cleanConfigValues,
                    RefPipelineBundleId: refPipelineBundleId,
                    ParentTempId: parentTempId,
                    Size: n.Size,
                    Metadata: n.Metadata
                );
            }).ToList();

            // Map edges with temporary IDs
            var packageEdges = graphDto.Edges
                .Where(e => nodeIdToTempId.ContainsKey(e.SourceNodeId) && nodeIdToTempId.ContainsKey(e.TargetNodeId))
                .Select(e => new PipelinePackageEdgeDto(
                    SourceNodeTempId: nodeIdToTempId[e.SourceNodeId],
                    SourcePin: e.SourcePin,
                    TargetNodeTempId: nodeIdToTempId[e.TargetNodeId],
                    TargetPin: e.TargetPin,
                    Kind: e.Kind
                )).ToList();

            packagePipelines.Add(new PipelinePackageItemDto(
                BundleId: bundleId,
                Name: p.Name,
                Description: null,
                IsRoot: isRoot,
                ImportOrder: importOrder,
                DependsOn: directDeps,
                TriggerType: p.TriggerType,
                Parameters: graphDto.Parameters,
                Graph: new PipelinePackageGraphDto(packageNodes, packageEdges),
                TriggerConfig: p.TriggerConfig
            ));
        }

        // Sort by ImportOrder for consistent, predictable output
        packagePipelines = packagePipelines.OrderBy(p => p.ImportOrder).ToList();

        var rootCount = packagePipelines.Count(p => p.IsRoot);
        var subCount = packagePipelines.Count(p => !p.IsRoot);

        var packageDto = new PipelinePackageDto(
            FormatVersion: "1.0",
            BundleType: "PipelinePackage",
            ExportedAt: DateTimeOffset.UtcNow,
            Metadata: new PipelinePackageMetadataDto(
                TotalPipelines: packagePipelines.Count,
                RootPipelinesCount: rootCount,
                SubPipelinesCount: subCount
            ),
            Pipelines: packagePipelines,
            Dependencies: new PipelinePackageDependenciesDto(
                CustomScripts: customScriptsMap.Values.OrderBy(s => s.Key).ToList(),
                RequiredContentTypes: []
            )
        );

        return Result.Ok(packageDto);
    }

    private async Task<string?> FetchScriptContentAsync(string? publicUrl, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(publicUrl))
        {
            return null;
        }

        try
        {
            var client = httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            return await client.GetStringAsync(publicUrl, ct);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not fetch script content from {Url}. Script content will be omitted in export.", publicUrl);
            return null;
        }
    }

    private static string Slugify(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return "pipeline";
        var slug = text.ToLowerInvariant().Trim();
        slug = Regex.Replace(slug, @"[^a-z0-9\-_]+", "-");
        slug = Regex.Replace(slug, @"-+", "-").Trim('-');
        return string.IsNullOrEmpty(slug) ? "pipeline" : (slug.Length > 30 ? slug[..30] : slug);
    }
}
