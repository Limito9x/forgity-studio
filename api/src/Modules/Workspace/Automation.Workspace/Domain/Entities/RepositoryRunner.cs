namespace Automation.Workspace.Domain.Entities;

public class RepositoryRunner : AuditableEntity
{
    public Guid RepositoryId { get; set; }
    public Repository Repository { get; set; } = null!;

    public Guid RunnerId { get; set; }
    public string RootPath { get; set; } = string.Empty;

    public ICollection<ResourceVersionLocation> Locations { get; set; } = new List<ResourceVersionLocation>();

    public RepositoryRunner() { }

    public RepositoryRunner(Guid repositoryId, Guid runnerId, string rootPath)
    {
        RepositoryId = repositoryId;
        RunnerId = runnerId;
        RootPath = rootPath;
    }

    public void UpdateRootPath(string rootPath)
    {
        RootPath = rootPath;
    }
}
