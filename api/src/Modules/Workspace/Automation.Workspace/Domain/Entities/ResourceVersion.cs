namespace Automation.Workspace.Domain.Entities;

public class ResourceVersion : AuditableEntity
{
    public Guid ResourceId { get; set; }
    public ResourceItem Resource { get; set; } = null!;
    public int VersionNo { get; set; }
    public string? Notes { get; set; }
    public string FileHash { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public System.Text.Json.JsonDocument? Metadata { get; set; }
    private readonly List<ResourceVersionLocation> _locations = new();
    public IReadOnlyList<ResourceVersionLocation> Locations => _locations.AsReadOnly();

    public ResourceVersion() { }

    public ResourceVersion(
        Guid resourceId,
        int versionNo,
        long sizeBytes,
        string fileHash,
        string? notes = null
    )
    {
        ResourceId = resourceId;
        VersionNo = versionNo;
        Notes = notes;
        FileHash = fileHash;
        SizeBytes = sizeBytes;
    }

    internal ResourceVersionLocation AddLocation(
        Guid repositoryRunnerId,
        bool isOrigin = false,
        DateTimeOffset? discoveredAt = null
    )
    {
        var existing = _locations.FirstOrDefault(x => x.RepositoryRunnerId == repositoryRunnerId);
        if (existing != null)
        {
            if (isOrigin)
                MarkLocationAsOrigin(repositoryRunnerId);
            return existing;
        }

        // Chưa có location => version đầu tiên
        if (_locations.Count == 0)
        {
            isOrigin = true;
        }

        if (isOrigin)
        {
            foreach (var loc in _locations)
            {
                loc.SetOrigin(false);
            }
        }

        var location = new ResourceVersionLocation(Id, repositoryRunnerId, isOrigin, discoveredAt);
        _locations.Add(location);
        return location;
    }

    public void MarkLocationAsOrigin(Guid repositoryRunnerId)
    {
        var location =
            _locations.FirstOrDefault(x => x.RepositoryRunnerId == repositoryRunnerId)
            ?? throw new InvalidOperationException("Location not found");

        foreach (var loc in _locations)
        {
            loc.SetOrigin(false);
        }

        location.SetOrigin(true);
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void UpdateMetadata(System.Text.Json.JsonDocument? metadata)
    {
        Metadata = metadata;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void SetMetadata(System.Text.Json.JsonDocument? metadata) => UpdateMetadata(metadata);
}
