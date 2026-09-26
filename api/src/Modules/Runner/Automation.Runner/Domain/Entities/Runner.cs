using Automation.SharedKernel.Domain.Entities;

namespace Automation.Runner.Domain.Entities;

public class Runner : BaseEntity
{
    public string Name { get; set; } = string.Empty;
    public string MachineKey { get; set; } = string.Empty;
    public string RegistrationToken { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTimeOffset? LastSeenAt { get; set; }

    // Hardware Specs (Indexable columns for Job Dispatching)
    public string OsPlatform { get; set; } = string.Empty;
    public string CpuModel { get; set; } = string.Empty;
    public long TotalRamBytes { get; set; }
    public string PrimaryGpuName { get; set; } = string.Empty;
    public long PrimaryGpuVramBytes { get; set; }
    public DateTimeOffset? LastHardwareScannedAt { get; set; }

    // Full Hardware Snapshot (PostgreSQL JSONB)
    public RunnerHardwareProfile? HardwareDetails { get; set; }

    public ICollection<RunnerExecutorConfig> ExecutorConfigs { get; set; } = new List<RunnerExecutorConfig>();
    public ICollection<RunnerStudio> Studios { get; set; } = new List<RunnerStudio>();
}
