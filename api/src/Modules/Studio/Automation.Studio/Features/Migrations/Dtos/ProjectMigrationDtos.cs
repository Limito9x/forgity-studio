using System.Text.Json;
using Automation.Studio.Domain.Entities;

namespace Automation.Studio.Features.Migrations.Dtos;

public record ProjectMigrationManifestDto(
    string PackageFormatVersion,
    string Generator,
    DateTimeOffset ExportedAt,
    string SourceStudio,
    string SourceProjectName,
    string SourceProjectSlug,
    string ChecksumSha256,
    List<string> Domains,
    Dictionary<string, JsonElement>? DomainPayloads = null
);

public record ExportProjectPackageRequest(List<string>? Domains = null);

public record ImportProjectPackageResultDto(
    Guid MigrationLogId,
    string Status,
    int TotalItems,
    int CreatedItems,
    int UpdatedItems,
    int SkippedItems,
    Dictionary<string, DomainMigrationResultSummaryDto> DomainSummaries,
    List<string> Warnings,
    string? ErrorMessage = null
);

public record DomainMigrationResultSummaryDto(
    int Total,
    int Created,
    int Updated,
    int Skipped,
    List<string> Warnings
);

public record ProjectMigrationLogDto(
    Guid Id,
    Guid ProjectId,
    Guid StudioId,
    Guid UserId,
    string UserDisplayName,
    string Type,
    string Status,
    string PackageFileName,
    long PackageSizeBytes,
    string PackageChecksumSha256,
    List<string> SelectedDomains,
    Dictionary<string, DomainMigrationResultSummaryDto>? DomainSummaries,
    string? ErrorMessage,
    DateTimeOffset CreatedAt
);

public record GetProjectMigrationHistoryRequest(int Page = 1, int PageSize = 20);
