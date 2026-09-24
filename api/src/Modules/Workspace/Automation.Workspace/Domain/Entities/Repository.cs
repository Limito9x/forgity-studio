namespace Automation.Workspace.Domain.Entities;

public class Repository : BaseEntity
{
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    public ICollection<ResourceItem> Resources { get; set; } = new List<ResourceItem>();
    public ICollection<RepositoryRunner> RepositoryRunners { get; set; } = new List<RepositoryRunner>();

    public Repository() { }

    public Repository(Guid projectId, string name, string? description = null)
    {
        ProjectId = projectId;
        Name = name;
        Description = description;
    }

    public void Update(string name, string? description = null)
    {
        Name = name;
        Description = description;
    }
}
