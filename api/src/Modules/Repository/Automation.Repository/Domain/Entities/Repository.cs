namespace Automation.Repository.Domain.Entities;

public class Repository : BaseEntity
{
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<string> SupportedExtensions { get; set; } = [];

    public ICollection<ResourceItem> Resources { get; set; } = new List<ResourceItem>();
    public ICollection<RepositoryRunner> RepositoryRunners { get; set; } = new List<RepositoryRunner>();

    public Repository() { }

    public Repository(
        Guid projectId,
        string name,
        string? description = null,
        List<string>? supportedExtensions = null
    )
    {
        ProjectId = projectId;
        Name = name;
        Description = description;
        SupportedExtensions = supportedExtensions ?? [];
    }

    public void Update(string name, string? description = null, List<string>? supportedExtensions = null)
    {
        Name = name;
        Description = description;
        if (supportedExtensions != null)
        {
            SupportedExtensions = supportedExtensions;
        }
    }
}
