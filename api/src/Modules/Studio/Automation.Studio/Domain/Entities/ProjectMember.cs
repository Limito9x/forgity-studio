using Automation.Studio.Domain.Enums;

namespace Automation.Studio.Domain.Entities;

public class ProjectMember : AuditableEntity
{
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = null!;
    
    public Guid UserId { get; set; }
    public ProjectRole ProjectRole { get; set; }

    public ProjectMember() { }

    public ProjectMember(Guid projectId, Guid userId, ProjectRole projectRole)
    {
        ProjectId = projectId;
        UserId = userId;
        ProjectRole = projectRole;
    }
}

