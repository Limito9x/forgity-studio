namespace Automation.Projects.Domain.Entities;

public class Project : BaseEntity
{
    public Guid StudioId { get; set; }
    public Studio Studio { get; set; } = null!;

    public string Name { get; set; } = string.Empty;
    public Guid OwnerId { get; set; } = Guid.Empty;
}
