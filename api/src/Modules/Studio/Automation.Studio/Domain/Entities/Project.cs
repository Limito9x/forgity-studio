namespace Automation.Studio.Domain.Entities;

public class Project : BaseEntity
{
    public Guid StudioId { get; set; }
    public StudioEntity Studio { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public Guid OwnerId { get; set; } = Guid.Empty;
    public Guid? StorageProfileId { get; set; }

    public Project() { }

    public Project(Guid studioId, string name, string slug, Guid ownerId, Guid? storageProfileId = null)
    {
        StudioId = studioId;
        Name = name;
        Slug = slug;
        OwnerId = ownerId;
        StorageProfileId = storageProfileId;
    }

    public void Update(string name, string slug, Guid? storageProfileId = null)
    {
        Name = name;
        Slug = slug;
        StorageProfileId = storageProfileId;
    }
}

