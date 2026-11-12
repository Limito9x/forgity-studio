using Automation.Studio.Contracts;

namespace Automation.Studio.Domain.Entities;

public class Studio : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }

    public StudioPlanTier PlanTier { get; set; } = StudioPlanTier.Community;
    public int ExecutionCreditsRemaining { get; set; } = 50;
    public long StudioManagedStorageQuotaBytes { get; set; } = 200L * 1024 * 1024; // 200MB default
    public long StudioManagedStorageUsedBytes { get; set; } = 0;

    public ICollection<Project> Projects { get; set; } = new List<Project>();
}
