using System.IO.Compression;
using System.Text.Json;
using Automation.Repository.Domain.Entities;
using Automation.Repository.Infrastructure.Persistence;
using Automation.Studio.Features.Migrations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Studio.Features.Migrations.Providers;

public record RepositoryPackageExportDto(
    string Name,
    string? Description,
    List<string> SupportedExtensions,
    List<string> IncludedSubPaths,
    int MaxScanFiles
);

public class RepositoryMigrationProvider(
    RepositoryDbContext repositoryDb,
    ILogger<RepositoryMigrationProvider> logger
) : IProjectMigrationProvider
{
    public string DomainKey => "repositories";
    public string DisplayLabel => "Repository Workspaces";
    public int SortOrder => 30;

    public async Task<object?> ExportDomainAsync(
        Guid projectId,
        ZipArchive zip,
        CancellationToken ct
    )
    {
        var repositories = await repositoryDb
            .Repositories.AsNoTracking()
            .Where(r => r.ProjectId == projectId)
            .ToListAsync(ct);

        if (repositories.Count == 0)
        {
            return null;
        }

        var exportItems = repositories
            .Select(r => new RepositoryPackageExportDto(
                Name: r.Name,
                Description: r.Description,
                SupportedExtensions: r.SupportedExtensions ?? [],
                IncludedSubPaths: r.IncludedSubPaths ?? [],
                MaxScanFiles: r.MaxScanFiles
            ))
            .ToList();

        return exportItems;
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
        List<RepositoryPackageExportDto>? items = null;

        try
        {
            items = JsonSerializer.Deserialize<List<RepositoryPackageExportDto>>(
                domainData.GetRawText(),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }
            );
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to deserialize RepositoryPackageExportDto");
        }

        if (items == null || items.Count == 0)
        {
            return new DomainMigrationResultSummary(0, 0, 0, 0, warnings);
        }

        var created = 0;
        var updated = 0;
        var skipped = 0;

        foreach (var item in items)
        {
            var existing = await repositoryDb.Repositories.FirstOrDefaultAsync(
                r => r.ProjectId == projectId && r.Name == item.Name,
                ct
            );

            if (existing != null)
            {
                if (strategy == ConflictResolutionStrategy.Skip)
                {
                    skipped++;
                    continue;
                }

                existing.Update(
                    name: item.Name,
                    description: item.Description,
                    supportedExtensions: item.SupportedExtensions,
                    includedSubPaths: item.IncludedSubPaths,
                    maxScanFiles: item.MaxScanFiles
                );
                updated++;
            }
            else
            {
                var repo = new Repository.Domain.Entities.Repository(
                    projectId: projectId,
                    name: item.Name,
                    description: item.Description,
                    supportedExtensions: item.SupportedExtensions,
                    includedSubPaths: item.IncludedSubPaths,
                    maxScanFiles: item.MaxScanFiles
                );

                repositoryDb.Repositories.Add(repo);
                created++;
            }
        }

        await repositoryDb.SaveChangesAsync(ct);

        return new DomainMigrationResultSummary(
            Total: items.Count,
            Created: created,
            Updated: updated,
            Skipped: skipped,
            Warnings: warnings
        );
    }
}
