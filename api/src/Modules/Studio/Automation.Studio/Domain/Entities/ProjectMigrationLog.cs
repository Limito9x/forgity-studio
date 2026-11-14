using System.Text.Json;
using Automation.SharedKernel.Domain.Entities;

namespace Automation.Studio.Domain.Entities;

public enum ProjectMigrationType
{
    Export = 0,
    Import = 1,
}

public enum ProjectMigrationStatus
{
    Pending = 0,
    Success = 1,
    PartialSuccess = 2,
    Failed = 3,
}

public class ProjectMigrationLog : BaseEntity
{
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public Guid StudioId { get; set; }
    public StudioEntity Studio { get; set; } = null!;

    public Guid UserId { get; set; }
    public string UserDisplayName { get; set; } = string.Empty;

    public ProjectMigrationType Type { get; set; }
    public ProjectMigrationStatus Status { get; set; }

    public string PackageFileName { get; set; } = string.Empty;
    public long PackageSizeBytes { get; set; }
    public string PackageChecksumSha256 { get; set; } = string.Empty;

    /// <summary>
    /// Danh mục được chọn trong gói, ví dụ: ["pipelines", "content", "repositories", "constants"]
    /// </summary>
    public List<string> SelectedDomains { get; set; } = [];

    /// <summary>
    /// Thống kê chi tiết theo domain: { "pipelines": { "total": 2, "created": 2, "updated": 0, "skipped": 0, "warnings": [] } }
    /// </summary>
    public JsonDocument? DomainSummaries { get; set; }

    public string? ErrorMessage { get; set; }

    public ProjectMigrationLog() { }

    public ProjectMigrationLog(
        Guid projectId,
        Guid studioId,
        Guid userId,
        string userDisplayName,
        ProjectMigrationType type,
        ProjectMigrationStatus status,
        string packageFileName,
        long packageSizeBytes,
        string packageChecksumSha256,
        List<string> selectedDomains,
        JsonDocument? domainSummaries = null,
        string? errorMessage = null
    )
    {
        ProjectId = projectId;
        StudioId = studioId;
        UserId = userId;
        UserDisplayName = userDisplayName;
        Type = type;
        Status = status;
        PackageFileName = packageFileName;
        PackageSizeBytes = packageSizeBytes;
        PackageChecksumSha256 = packageChecksumSha256;
        SelectedDomains = selectedDomains;
        DomainSummaries = domainSummaries;
        ErrorMessage = errorMessage;
    }
}
