namespace Automation.Repository.Domain.Entities;

public class ResourceItem : BaseEntity
{
    public Guid RepositoryId { get; set; }
    public Repository Repository { get; set; } = null!;
    public string DisplayName { get; set; } = string.Empty;
    public string Extension { get; set; } = string.Empty;

    // Định danh duy nhất trong repository - không thể thay đổi
    public string RelativePath { get; set; } = string.Empty;
    public Guid? ContentId { get; set; }

    // Smart Collaborative Lock
    public Guid? LockedByRunnerId { get; set; }
    public Guid? LockedByUserId { get; set; }
    public DateTimeOffset? LockedAt { get; set; }
    public bool IsLocked => LockedByRunnerId.HasValue;

    private readonly List<ResourceVersion> _versions = new();
    public IReadOnlyList<ResourceVersion> Versions => _versions.AsReadOnly();

    public ResourceItem() { }

    public ResourceItem(
        Guid repositoryId,
        string displayName,
        string extension,
        string relativePath,
        Guid? contentId = null
    )
    {
        RepositoryId = repositoryId;
        DisplayName = displayName;
        Extension = extension;
        ContentId = contentId;
        RelativePath = relativePath;
    }

    public static ResourceItem Create(
        Guid repositoryId,
        Guid repositoryRunnerId,
        string extension,
        string name,
        string relativePath,
        string fileHash,
        long sizeBytes = 0,
        string? notes = null,
        Guid? lockedByRunnerId = null,
        Guid? lockedByUserId = null
    )
    {
        var resource = new ResourceItem(repositoryId, name, extension, relativePath);
        resource.AddNewVersion(repositoryRunnerId, fileHash, sizeBytes, notes);
        if (lockedByRunnerId.HasValue)
        {
            resource.Lock(lockedByRunnerId.Value, lockedByUserId);
        }
        return resource;
    }

    public void Lock(Guid runnerId, Guid? userId = null)
    {
        LockedByRunnerId = runnerId;
        LockedByUserId = userId;
        LockedAt = DateTimeOffset.UtcNow;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void Unlock()
    {
        LockedByRunnerId = null;
        LockedByUserId = null;
        LockedAt = null;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public bool IsLockedByOther(Guid runnerId) => IsLocked && LockedByRunnerId != runnerId;
    public bool CanModify(Guid runnerId) => !IsLocked || LockedByRunnerId == runnerId;

    public ResourceVersion AddNewVersion(
        Guid repositoryRunnerId,
        string fileHash,
        long sizeBytes = 0,
        string? notes = null,
        Automation.Repository.Domain.Enums.ResourceVersionStatus status = Automation.Repository.Domain.Enums.ResourceVersionStatus.Draft
    )
    {
        var newVersion = new ResourceVersion(Id, _versions.Count + 1, sizeBytes, fileHash, notes, status);
        newVersion.AddLocation(repositoryRunnerId);
        _versions.Add(newVersion);
        return newVersion;
    }

    public ResourceVersion? LatestVersion =>
        _versions.OrderByDescending(x => x.VersionNo).FirstOrDefault();

    public ResourceVersion? CurrentDraftVersion =>
        _versions.FirstOrDefault(x => x.Status == Automation.Repository.Domain.Enums.ResourceVersionStatus.Draft);

    public bool HasOnLocal(Guid repositoryRunnerId) =>
        _versions.Any(x => x.Locations.Any(y => y.RepositoryRunnerId == repositoryRunnerId));

    public void AssignContent(Guid? contentId)
    {
        ContentId = contentId;
        UpdatedAt = DateTimeOffset.UtcNow;
    }

    public void RemoveContent()
    {
        ContentId = null;
        UpdatedAt = DateTimeOffset.UtcNow;
    }
}
