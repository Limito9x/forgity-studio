using System.Text.Json;
using Automation.SharedKernel.Domain.Entities;

namespace Automation.Runner.Domain.Entities;

public class RunnerExecutorConfig : AuditableEntity
{
    public Guid RunnerId { get; set; }
    public Runner Runner { get; set; } = null!;
    public string ExecutorKey { get; set; } = string.Empty;
    public string? Version { get; set; }
    public string ExecutablePath { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
    public JsonDocument? Settings { get; set; }
}
