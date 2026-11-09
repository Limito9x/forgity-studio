using System.IO.Compression;
using System.Text.Json;
using Automation.Content.Domain.Entities;
using Automation.Content.Infrastructure.Persistence;
using Automation.DynamicForms.Domain.Entities;
using Automation.DynamicForms.Infrastructure.Persistence;
using Automation.Studio.Features.Migrations.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Automation.Studio.Features.Migrations.Providers;

public record ContentTypePackageExportDto(
    string Key,
    string Name,
    string DisplayName,
    string? Description,
    string? Icon,
    string? Color,
    int SortOrder,
    JsonDocument DisplayConfig,
    List<SchemaVersionExportDto>? SchemaVersions = null
);

public record SchemaVersionExportDto(
    int VersionNumber,
    JsonDocument Fields
);

public class ContentMigrationProvider(
    ContentDbContext contentDb,
    DynamicFormsDbContext dynamicFormsDb,
    ILogger<ContentMigrationProvider> logger
) : IProjectMigrationProvider
{
    public string DomainKey => "content";
    public string DisplayLabel => "Content Types & Schemas";
    public int SortOrder => 20;

    public async Task<object?> ExportDomainAsync(Guid projectId, ZipArchive zip, CancellationToken ct)
    {
        var contentTypes = await contentDb.ContentTypes
            .AsNoTracking()
            .Where(c => c.ProjectId == projectId)
            .OrderBy(c => c.SortOrder)
            .ToListAsync(ct);

        if (contentTypes.Count == 0)
        {
            return null;
        }

        var exportItems = new List<ContentTypePackageExportDto>();

        foreach (var ctEntity in contentTypes)
        {
            var schemaDef = await dynamicFormsDb.SchemaDefinitions
                .Include(s => s.Versions)
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.OwnerId == ctEntity.Id.ToString() && s.OwnerType == "ContentType", ct);

            var versions = schemaDef?.Versions
                .OrderBy(v => v.Version)
                .Select(v => new SchemaVersionExportDto(v.Version, v.Fields))
                .ToList();

            exportItems.Add(new ContentTypePackageExportDto(
                Key: ctEntity.Key,
                Name: ctEntity.Name,
                DisplayName: ctEntity.DisplayName,
                Description: ctEntity.Description,
                Icon: ctEntity.Icon,
                Color: ctEntity.Color,
                SortOrder: ctEntity.SortOrder,
                DisplayConfig: ctEntity.DisplayConfig,
                SchemaVersions: versions
            ));
        }

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
        List<ContentTypePackageExportDto>? items = null;

        try
        {
            items = JsonSerializer.Deserialize<List<ContentTypePackageExportDto>>(domainData.GetRawText(), new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to deserialize ContentTypePackageExportDto");
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
            var existing = await contentDb.ContentTypes
                .FirstOrDefaultAsync(c => c.ProjectId == projectId && (c.Key == item.Key || c.Name == item.Name), ct);

            if (existing != null)
            {
                if (strategy == ConflictResolutionStrategy.Skip)
                {
                    skipped++;
                    continue;
                }

                existing.Update(
                    name: item.Name,
                    displayName: item.DisplayName,
                    description: item.Description,
                    icon: item.Icon,
                    color: item.Color,
                    sortOrder: item.SortOrder,
                    displayConfig: item.DisplayConfig
                );
                updated++;
            }
            else
            {
                var newEntity = new ContentType(
                    projectId: projectId,
                    key: item.Key,
                    name: item.Name,
                    displayName: item.DisplayName,
                    description: item.Description,
                    icon: item.Icon,
                    color: item.Color,
                    sortOrder: item.SortOrder,
                    displayConfig: item.DisplayConfig
                );

                contentDb.ContentTypes.Add(newEntity);
                await contentDb.SaveChangesAsync(ct);

                // Create or sync schema versions in DynamicForms if provided
                if (item.SchemaVersions != null && item.SchemaVersions.Count > 0)
                {
                    var schemaDef = new SchemaDefinition(item.Name, newEntity.Id.ToString(), "ContentType");
                    dynamicFormsDb.SchemaDefinitions.Add(schemaDef);
                    await dynamicFormsDb.SaveChangesAsync(ct);

                    for (var i = 0; i < item.SchemaVersions.Count; i++)
                    {
                        var v = item.SchemaVersions[i];
                        var isLatest = i == item.SchemaVersions.Count - 1;
                        var sv = new SchemaVersion(schemaDef.Id, v.Fields, v.VersionNumber, isLatest);
                        dynamicFormsDb.SchemaVersions.Add(sv);
                    }
                    await dynamicFormsDb.SaveChangesAsync(ct);
                }

                created++;
            }
        }

        await contentDb.SaveChangesAsync(ct);

        return new DomainMigrationResultSummary(
            Total: items.Count,
            Created: created,
            Updated: updated,
            Skipped: skipped,
            Warnings: warnings
        );
    }
}
