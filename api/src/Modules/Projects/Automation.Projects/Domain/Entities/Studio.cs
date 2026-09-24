namespace Automation.Projects.Domain.Entities;

public class Studio : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }

    public ICollection<Project> Projects { get; set; } = new List<Project>();
    public ICollection<StudioRunner> StudioRunners { get; set; } = new List<StudioRunner>();
}
