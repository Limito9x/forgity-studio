using Automation.SharedKernel.Domain.Entities;

namespace Automation.Runner.Domain.Entities;

public class Runner : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string MachineKey { get; set; } = string.Empty;
    public string RegistrationToken { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset? LastSeenAt { get; set; }

    public ICollection<RunnerExecutorConfig> ExecutorConfigs { get; set; } = new List<RunnerExecutorConfig>();
}
