using System.IO.Compression;
using System.Text.Json;

namespace Automation.Studio.Features.Migrations.Domain;

public enum ConflictResolutionStrategy
{
    Overwrite = 0,
    Skip = 1,
}

public record DomainMigrationResultSummary(
    int Total,
    int Created,
    int Updated,
    int Skipped,
    List<string> Warnings
);

public interface IProjectMigrationProvider
{
    string DomainKey { get; }
    string DisplayLabel { get; }
    int SortOrder { get; }

    Task<object?> ExportDomainAsync(Guid projectId, ZipArchive zip, CancellationToken ct);

    Task<DomainMigrationResultSummary> ImportDomainAsync(
        Guid projectId,
        JsonElement domainData,
        ZipArchive? zip,
        ConflictResolutionStrategy strategy,
        CancellationToken ct
    );
}
