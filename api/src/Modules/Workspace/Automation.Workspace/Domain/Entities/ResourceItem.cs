namespace Automation.Workspace.Domain.Entities;

public class ResourceItem : BaseEntity
{
    public Guid RepositoryId { get; set; }
    public Repository Repository { get; set; } = null!;
    public string DisplayName { get; set; } = string.Empty;
    public Guid PlatformExtensionId { get; set; }

    // Định danh duy nhất trong repository - không thể thay đổi
    public string RelativePath { get; set; } = string.Empty;
    public Guid? ContentId { get; set; }

    private readonly List<ResourceVersion> _versions = new();
    public IReadOnlyList<ResourceVersion> Versions => _versions.AsReadOnly();

    public ResourceItem() { }

    public ResourceItem(
        Guid repositoryId,
        string displayName,
        Guid platformExtensionId,
        string relativePath,
        Guid? contentId = null
    )
    {
        RepositoryId = repositoryId;
        DisplayName = displayName;
        PlatformExtensionId = platformExtensionId;
        ContentId = contentId;
        RelativePath = relativePath;
    }

    public static ResourceItem Create(
        Guid repositoryId,
        Guid repositoryRunnerId,
        Guid platformExtensionId,
        string name,
        string relativePath,
        string fileHash,
        long sizeBytes = 0,
        string? notes = null
    )
    {
        var resource = new ResourceItem(repositoryId, name, platformExtensionId, relativePath);
        resource.AddNewVersion(repositoryRunnerId, fileHash, sizeBytes, notes);
        return resource;
    }

    public ResourceVersion AddNewVersion(
        Guid repositoryRunnerId,
        string fileHash,
        long sizeBytes = 0,
        string? notes = null
    )
    {
        var newVersion = new ResourceVersion(Id, _versions.Count + 1, sizeBytes, fileHash, notes);
        newVersion.AddLocation(repositoryRunnerId);
        _versions.Add(newVersion);
        return newVersion;
    }

    public ResourceVersion? LatestVersion =>
        _versions.OrderByDescending(x => x.VersionNo).FirstOrDefault();

    public bool HasOnLocal(Guid repositoryRunnerId) =>
        _versions.Any(x => x.Locations.Any(y => y.RepositoryRunnerId == repositoryRunnerId));

    public void AssignContent(Guid? contentId)
    {
        ContentId = contentId;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
