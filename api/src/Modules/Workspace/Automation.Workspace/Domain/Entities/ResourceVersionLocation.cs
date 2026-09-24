namespace Automation.Workspace.Domain.Entities;

public class ResourceVersionLocation : AuditableEntity
{
    public Guid ResourceVersionId { get; set; }
    public ResourceVersion ResourceVersion { get; set; } = null!;

    public Guid RepositoryRunnerId { get; set; }
    public RepositoryRunner RepositoryRunner { get; set; } = null!;
    public bool IsOrigin { get; set; }
    public DateTimeOffset DiscoveredAt { get; set; }

    public ResourceVersionLocation() { }

    public ResourceVersionLocation(
        Guid resourceVersionId,
        Guid repositoryRunnerId,
        bool isOrigin = false,
        DateTimeOffset? discoveredAt = null
    )
    {
        ResourceVersionId = resourceVersionId;
        RepositoryRunnerId = repositoryRunnerId;
        IsOrigin = isOrigin;
        DiscoveredAt = discoveredAt ?? DateTimeOffset.UtcNow;
    }

    public void SetOrigin(bool isOrigin)
    {
        IsOrigin = isOrigin;
    }
}
