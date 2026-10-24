using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.Validation;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Pipelines;

public class ValidatePipelinePackageEndpoint(IMessageBus bus) : Endpoint<ValidatePipelinePackageRequest, ValidatePipelinePackageResponseDto>
{
    public override void Configure()
    {
        Post("import-validate");
        Group<PipelinesGroup>();
        Permissions(P.Pipeline.Create);
        Description(d => d
            .Produces<ValidatePipelinePackageResponseDto>(200)
            .Produces(400));
    }

    public override async Task HandleAsync(ValidatePipelinePackageRequest req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<ValidatePipelinePackageResponseDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class ValidatePipelinePackageHandler(
    PipelineDbContext db,
    ITransientPipelineGraphFactory transientFactory,
    IPipelineContractValidator contractValidator
)
{
    public async Task<Result<ValidatePipelinePackageResponseDto>> HandleAsync(
        ValidatePipelinePackageRequest query,
        CancellationToken ct
    )
    {
        var package = query.Package;
        var validationErrors = new List<string>();

        if (package == null)
        {
            return Result.Fail<ValidatePipelinePackageResponseDto>("Package data cannot be empty.");
        }

        if (string.IsNullOrWhiteSpace(package.FormatVersion))
        {
            validationErrors.Add("Missing format version.");
        }

        if (package.Pipelines == null || package.Pipelines.Count == 0)
        {
            validationErrors.Add("Package contains no pipelines to import.");
        }

        var pipelines = package.Pipelines ?? [];

        // Check for duplicate BundleIds in package
        var duplicateBundleIds = pipelines
            .GroupBy(p => p.BundleId, StringComparer.OrdinalIgnoreCase)
            .Where(g => g.Count() > 1)
            .Select(g => g.Key)
            .ToList();

        if (duplicateBundleIds.Count > 0)
        {
            validationErrors.Add($"Package has duplicate bundle IDs: {string.Join(", ", duplicateBundleIds)}");
        }

        // Dựng Pipeline tạm thời để kiểm tra hợp đồng và chẩn đoán cấu trúc đồ thị
        TransientPackageBuildResult? buildResult = null;
        Dictionary<string, TransientPackagePipelineItem> buildItemByBundleId = [];

        if (pipelines.Count > 0)
        {
            buildResult = await transientFactory.BuildFromPackageAsync(query.ProjectId, package, ct: ct);
            buildItemByBundleId = buildResult.Items.ToDictionary(x => x.SourceDto.BundleId, StringComparer.OrdinalIgnoreCase);
        }

        var pipelinePreviews = new List<PipelinePackageItemPreviewDto>();
        var validationWarnings = new List<string>();

        foreach (var p in pipelines)
        {
            var nodeCount = p.Graph?.Nodes?.Count ?? 0;
            var edgeCount = p.Graph?.Edges?.Count ?? 0;

            if (buildItemByBundleId.TryGetValue(p.BundleId, out var item))
            {
                var valResult = await contractValidator.ValidateGraphAsync(item.Pipeline, item.Context, ct: ct);
                var nodesById = item.Pipeline.Nodes.ToDictionary(n => n.Id);

                foreach (var diag in valResult.Diagnostics)
                {
                    if (transientFactory.IsStructuralImportBlocker(diag, nodesById))
                    {
                        validationErrors.Add($"Pipeline '{p.Name}': {diag.Message}");
                    }
                    else if (diag.Severity == PipelineDiagnosticSeverity.Error)
                    {
                        validationWarnings.Add($"Pipeline '{p.Name}': {diag.Message}");
                    }
                }

                pipelinePreviews.Add(new PipelinePackageItemPreviewDto(
                    BundleId: p.BundleId,
                    Name: p.Name,
                    IsRoot: p.IsRoot,
                    ImportOrder: p.ImportOrder,
                    DependsOn: p.DependsOn ?? [],
                    NodeCount: nodeCount,
                    EdgeCount: edgeCount,
                    HasNameConflict: item.HasNameConflict,
                    SuggestedName: item.ResolvedName,
                    Diagnostics: valResult.Diagnostics
                ));
            }
            else
            {
                pipelinePreviews.Add(new PipelinePackageItemPreviewDto(
                    BundleId: p.BundleId,
                    Name: p.Name,
                    IsRoot: p.IsRoot,
                    ImportOrder: p.ImportOrder,
                    DependsOn: p.DependsOn ?? [],
                    NodeCount: nodeCount,
                    EdgeCount: edgeCount,
                    HasNameConflict: false,
                    SuggestedName: p.Name.Trim()
                ));
            }
        }

        // Check Custom Script dependencies
        var scriptPreviews = new List<PipelineScriptDependencyPreviewDto>();
        var packageScripts = package.Dependencies?.CustomScripts ?? [];

        // Collect all custom keys referenced across pipeline nodes in graph
        var customNodeKeysInGraph = pipelines
            .SelectMany(p => p.Graph?.Nodes ?? [])
            .Where(n => n.Kind == PipelineNodeKind.Custom)
            .Select(n => !string.IsNullOrWhiteSpace(n.CustomScriptKey) ? n.CustomScriptKey : n.RefId)
            .Where(k => !string.IsNullOrWhiteSpace(k))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var allScriptKeysToQuery = packageScripts.Select(s => s.Key)
            .Concat(customNodeKeysInGraph)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var existingNodeKeys = await db.NodeDefinitions
            .AsNoTracking()
            .Where(nd => nd.ProjectId == query.ProjectId && allScriptKeysToQuery.Contains(nd.Key))
            .Select(nd => nd.Key)
            .ToListAsync(ct);

        var existingKeySet = new HashSet<string>(existingNodeKeys, StringComparer.OrdinalIgnoreCase);
        var packageScriptMap = packageScripts.ToDictionary(s => s.Key, s => s, StringComparer.OrdinalIgnoreCase);

        if (packageScripts.Count > 0)
        {
            foreach (var s in packageScripts)
            {
                var hasContent = !string.IsNullOrWhiteSpace(s.ScriptContent);
                var alreadyExists = existingKeySet.Contains(s.Key);

                if (!alreadyExists && !hasContent)
                {
                    validationWarnings.Add($"Custom script '{s.Key}' has empty or missing script content in package.");
                }

                scriptPreviews.Add(new PipelineScriptDependencyPreviewDto(
                    Key: s.Key,
                    Name: s.Name,
                    Executor: s.Executor,
                    ContentHash: s.ContentHash,
                    FileName: s.FileName,
                    AlreadyExists: alreadyExists,
                    HasScriptContent: hasContent
                ));
            }
        }

        // Validate custom nodes in graph against available scripts
        foreach (var p in pipelines)
        {
            if (p.Graph?.Nodes == null) continue;
            foreach (var n in p.Graph.Nodes.Where(node => node.Kind == PipelineNodeKind.Custom))
            {
                var key = !string.IsNullOrWhiteSpace(n.CustomScriptKey) ? n.CustomScriptKey : n.RefId;
                var inProject = existingKeySet.Contains(key);
                var inPackageWithContent = packageScriptMap.TryGetValue(key, out var pkgScript) && !string.IsNullOrWhiteSpace(pkgScript.ScriptContent);

                if (!inProject && !inPackageWithContent)
                {
                    validationWarnings.Add($"Pipeline '{p.Name}': Custom node '{n.Label}' requires script '{key}' which has no source code in this package and does not exist in the project.");
                }
            }
        }

        // Check Content Type dependencies
        var contentTypePreviews = new List<PipelineContentTypeDependencyPreviewDto>();
        var packageContentTypes = package.Dependencies?.RequiredContentTypes ?? [];

        foreach (var ctDep in packageContentTypes)
        {
            contentTypePreviews.Add(new PipelineContentTypeDependencyPreviewDto(
                Key: ctDep.Key,
                Name: ctDep.Name,
                DisplayName: ctDep.DisplayName,
                AlreadyExists: false
            ));
        }

        var isValid = validationErrors.Count == 0;

        var response = new ValidatePipelinePackageResponseDto(
            IsValid: isValid,
            ValidationErrors: validationErrors,
            PackageMetadata: package.Metadata ?? new PipelinePackageMetadataDto(pipelines.Count, pipelines.Count(p => p.IsRoot), pipelines.Count(p => !p.IsRoot)),
            Pipelines: pipelinePreviews,
            Scripts: scriptPreviews,
            ContentTypes: contentTypePreviews,
            ValidationWarnings: validationWarnings.Count > 0 ? validationWarnings : null
        );

        return Result.Ok(response);
    }
}
