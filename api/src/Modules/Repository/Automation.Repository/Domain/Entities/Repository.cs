namespace Automation.Repository.Domain.Entities;

public class Repository : BaseEntity
{
    public Guid ProjectId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<string> SupportedExtensions { get; set; } = [];
    public List<string> IncludedSubPaths { get; set; } = [];
    public int MaxScanFiles { get; set; } = 2000;

    public ICollection<ResourceItem> Resources { get; set; } = new List<ResourceItem>();
    public ICollection<RepositoryRunner> RepositoryRunners { get; set; } = new List<RepositoryRunner>();

    public Repository() { }

    public Repository(
        Guid projectId,
        string name,
        string? description = null,
        List<string>? supportedExtensions = null,
        List<string>? includedSubPaths = null,
        int maxScanFiles = 2000
    )
    {
        ProjectId = projectId;
        Name = name;
        Description = description;
        SupportedExtensions = supportedExtensions ?? [];
        IncludedSubPaths = includedSubPaths ?? [];
        MaxScanFiles = maxScanFiles > 0 ? maxScanFiles : 2000;
    }

    public void Update(
        string name,
        string? description = null,
        List<string>? supportedExtensions = null,
        List<string>? includedSubPaths = null,
        int? maxScanFiles = null
    )
    {
        Name = name;
        Description = description;
        if (supportedExtensions != null)
        {
            SupportedExtensions = supportedExtensions;
        }
        if (includedSubPaths != null)
        {
            IncludedSubPaths = includedSubPaths;
        }
        if (maxScanFiles.HasValue && maxScanFiles.Value > 0)
        {
            MaxScanFiles = maxScanFiles.Value;
        }
    }
}
