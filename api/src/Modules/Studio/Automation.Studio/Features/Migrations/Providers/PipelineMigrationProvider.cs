using System.IO.Compression;
using System.Text.Json;
using Automation.Pipeline.BuildTime.Features.Packaging;
using Automation.Pipeline.BuildTime.Features.Packaging.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Studio.Features.Migrations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine;

namespace Automation.Studio.Features.Migrations.Providers;

public class PipelineMigrationProvider(
    IMessageBus bus,
    PipelineDbContext pipelineDb,
    ILogger<PipelineMigrationProvider> logger
) : IProjectMigrationProvider
{
    public string DomainKey => "pipelines";
    public string DisplayLabel => "Pipelines & Workflows";
    public int SortOrder => 10;

    public async Task<object?> ExportDomainAsync(
        Guid projectId,
        ZipArchive zip,
        CancellationToken ct
    )
    {
        var pipelines = await pipelineDb
            .Pipelines.AsNoTracking()
            .Where(p => p.ProjectId == projectId)
            .Select(p => p.Id)
            .ToListAsync(ct);

        if (pipelines.Count == 0)
        {
            return null;
        }

        var exportQuery = new ExportPipelinesQuery(pipelines, ExportPipelineMode.CleanTemplate);
        var exportResult = await bus.InvokeAsync<FluentResults.Result<PipelinePackageDto>>(
            exportQuery,
            ct
        );

        if (exportResult.IsFailed || exportResult.Value == null)
        {
            logger.LogWarning(
                "Failed to export pipelines for project {ProjectId}: {Error}",
                projectId,
                string.Join("; ", exportResult.Errors.Select(e => e.Message))
            );
            return null;
        }

        var packageDto = exportResult.Value;

        // Extract individual Python scripts into physical scripts/*.py files inside the ZIP
        if (packageDto.Dependencies?.CustomScripts != null)
        {
            foreach (var script in packageDto.Dependencies.CustomScripts)
            {
                if (!string.IsNullOrWhiteSpace(script.ScriptContent))
                {
                    var scriptFileName = !string.IsNullOrWhiteSpace(script.FileName)
                        ? script.FileName
                        : $"{script.Key}.py";

                    var entry = zip.CreateEntry(
                        $"scripts/{scriptFileName}",
                        CompressionLevel.Optimal
                    );
                    using var s = entry.Open();
                    using var writer = new StreamWriter(s, System.Text.Encoding.UTF8);
                    await writer.WriteAsync(script.ScriptContent);
                }
            }
        }

        return packageDto;
    }

    public async Task<DomainMigrationResultSummary> ImportDomainAsync(
        Guid projectId,
        JsonElement domainData,
        ZipArchive? zip,
        ConflictResolutionStrategy strategy,
        CancellationToken ct
    )
    {
        var warnings = new List<string>();
        PipelinePackageDto? packageDto = null;

        try
        {
            packageDto = JsonSerializer.Deserialize<PipelinePackageDto>(
                domainData.GetRawText(),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
            );
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to deserialize PipelinePackageDto from domainData");
        }

        if (packageDto?.Pipelines == null || packageDto.Pipelines.Count == 0)
        {
            return new DomainMigrationResultSummary(0, 0, 0, 0, warnings);
        }

        // If packageDto scripts are empty or have relative script paths, load them from zip scripts/
        if (zip != null && packageDto.Dependencies?.CustomScripts != null)
        {
            var enrichedScripts = new List<PipelinePackageScriptDto>();
            foreach (var script in packageDto.Dependencies.CustomScripts)
            {
                var content = script.ScriptContent;
                if (string.IsNullOrWhiteSpace(content))
                {
                    var scriptFileName = !string.IsNullOrWhiteSpace(script.FileName)
                        ? script.FileName
                        : $"{script.Key}.py";

                    var entry =
                        zip.GetEntry($"scripts/{scriptFileName}")
                        ?? zip.GetEntry($"scripts/{script.Key}.py");

                    if (entry != null)
                    {
                        using var s = entry.Open();
                        using var reader = new StreamReader(s, System.Text.Encoding.UTF8);
                        content = await reader.ReadToEndAsync(ct);
                    }
                }

                enrichedScripts.Add(script with { ScriptContent = content ?? string.Empty });
            }

            packageDto = packageDto with
            {
                Dependencies = packageDto.Dependencies with { CustomScripts = enrichedScripts },
            };
        }

        var importReq = new ImportPipelinePackageRequest(
            ProjectId: projectId,
            Package: packageDto,
            CreateMissingContentTypes: true
        );

        var importResult =
            await bus.InvokeAsync<FluentResults.Result<ImportPipelinePackageResponseDto>>(
                importReq,
                ct
            );

        if (importResult.IsFailed)
        {
            warnings.Add(
                $"Pipelines import failed: {string.Join("; ", importResult.Errors.Select(e => e.Message))}"
            );
            return new DomainMigrationResultSummary(
                packageDto.Pipelines.Count,
                0,
                0,
                packageDto.Pipelines.Count,
                warnings
            );
        }

        var res = importResult.Value;
        return new DomainMigrationResultSummary(
            Total: res.ImportedPipelinesCount,
            Created: res.ImportedPipelinesCount,
            Updated: 0,
            Skipped: packageDto.Pipelines.Count - res.ImportedPipelinesCount,
            Warnings: warnings
        );
    }
}
