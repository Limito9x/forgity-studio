using System.Text.Json;

namespace Automation.Studio.Domain.Entities;

public class ProjectExecutorConfig : AuditableEntity
{
    public Guid ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    public Guid AgentId { get; set; }
    public string ExecutorKey { get; set; } = string.Empty;
    public JsonDocument? Settings { get; set; }

    public ProjectExecutorConfig() { }

    public ProjectExecutorConfig(
        Guid projectId,
        Guid agentId,
        string executorKey,
        JsonDocument? settings = null
    )
    {
        ProjectId = projectId;
        AgentId = agentId;
        ExecutorKey = executorKey;
        Settings = settings;
    }

    public void Update(JsonDocument? settings)
    {
        Settings = settings;
    }
}
