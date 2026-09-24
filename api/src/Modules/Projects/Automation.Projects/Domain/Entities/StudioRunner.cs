namespace Automation.Projects.Domain.Entities;

public class StudioRunner : AuditableEntity
{
    public Guid StudioId { get; set; }
    public Studio Studio { get; set; } = null!;

    public Guid RunnerId { get; set; }
    public string? Alias { get; set; }
    public bool IsApproved { get; set; }
}
