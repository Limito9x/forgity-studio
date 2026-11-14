using Automation.SharedKernel.Domain.Entities;

namespace Automation.Runner.Domain.Entities;

public class RunnerStudio : AuditableEntity
{
    public Guid RunnerId { get; set; }
    public Runner Runner { get; set; } = null!;
    public Guid StudioId { get; set; }
    public string? Alias { get; set; }
    public bool IsApproved { get; set; } = true;
}
