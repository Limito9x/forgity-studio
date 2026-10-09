using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
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
    PipelineDbContext db
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

        // Check name conflicts with existing pipelines in target Project
        var existingNames = await db.Pipelines
            .AsNoTracking()
            .Where(p => p.ProjectId == query.ProjectId)
            .Select(p => p.Name)
            .ToListAsync(ct);

        var existingNamesSet = new HashSet<string>(existingNames, StringComparer.OrdinalIgnoreCase);

        var pipelinePreviews = new List<PipelinePackageItemPreviewDto>();
        foreach (var p in pipelines)
        {
            var hasConflict = existingNamesSet.Contains(p.Name.Trim());
            var suggestedName = p.Name.Trim();

            if (hasConflict)
            {
                var counter = 1;
                while (existingNamesSet.Contains(suggestedName))
                {
                    suggestedName = $"{p.Name.Trim()} (Imported{(counter > 1 ? $" {counter}" : "")})";
                    counter++;
                }
            }

            var nodeCount = p.Graph?.Nodes?.Count ?? 0;
            var edgeCount = p.Graph?.Edges?.Count ?? 0;

            pipelinePreviews.Add(new PipelinePackageItemPreviewDto(
                BundleId: p.BundleId,
                Name: p.Name,
                IsRoot: p.IsRoot,
                ImportOrder: p.ImportOrder,
                DependsOn: p.DependsOn ?? [],
                NodeCount: nodeCount,
                EdgeCount: edgeCount,
                HasNameConflict: hasConflict,
                SuggestedName: suggestedName
            ));
        }

        // Check Custom Script dependencies
        var scriptPreviews = new List<PipelineScriptDependencyPreviewDto>();
        var packageScripts = package.Dependencies?.CustomScripts ?? [];

        if (packageScripts.Count > 0)
        {
            var scriptKeys = packageScripts.Select(s => s.Key).ToList();
            var existingNodeKeys = await db.NodeDefinitions
                .AsNoTracking()
                .Where(nd => nd.ProjectId == query.ProjectId && scriptKeys.Contains(nd.Key))
                .Select(nd => nd.Key)
                .ToListAsync(ct);

            var existingKeySet = new HashSet<string>(existingNodeKeys, StringComparer.OrdinalIgnoreCase);

            foreach (var s in packageScripts)
            {
                scriptPreviews.Add(new PipelineScriptDependencyPreviewDto(
                    Key: s.Key,
                    Name: s.Name,
                    Executor: s.Executor,
                    ContentHash: s.ContentHash,
                    FileName: s.FileName,
                    AlreadyExists: existingKeySet.Contains(s.Key)
                ));
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
            ContentTypes: contentTypePreviews
        );

        return Result.Ok(response);
    }
}
