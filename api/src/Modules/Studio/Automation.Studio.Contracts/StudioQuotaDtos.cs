namespace Automation.Studio.Contracts;

public enum StudioPlanTier
{
    Community = 0,
    IndiePro = 1,
    StudioTeam = 2
}

public record StudioQuotaDto(
    Guid StudioId,
    string Name,
    string Slug,
    StudioPlanTier PlanTier,
    int ExecutionCreditsRemaining,
    long StudioManagedStorageQuotaBytes,
    long StudioManagedStorageUsedBytes
);

public record StudioAdminSummaryDto(
    Guid Id,
    string Name,
    string Slug,
    StudioPlanTier PlanTier,
    int ExecutionCreditsRemaining,
    long StudioManagedStorageQuotaBytes,
    long StudioManagedStorageUsedBytes,
    int ProjectCount,
    DateTimeOffset CreatedAt
);

public record AdminUpdateStudioQuotaDto(
    StudioPlanTier? PlanTier = null,
    int? ExecutionCreditsRemaining = null,
    long? StudioManagedStorageQuotaBytes = null
);

