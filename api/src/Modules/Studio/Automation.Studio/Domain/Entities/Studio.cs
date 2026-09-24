namespace Automation.Studio.Domain.Entities;

public class Studio : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string Slug { get; set; } = string.Empty;
    public string? Description { get; set; }

    public ICollection<Project> Projects { get; set; } = new List<Project>();
}
