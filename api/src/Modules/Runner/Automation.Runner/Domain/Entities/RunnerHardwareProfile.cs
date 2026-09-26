namespace Automation.Runner.Domain.Entities;

public class RunnerHardwareProfile
{
    public List<RunnerGpuInfo> Gpus { get; set; } = new();
    public List<RunnerDiskInfo> Disks { get; set; } = new();
    public string Architecture { get; set; } = string.Empty;
    public string PythonRuntimeVersion { get; set; } = string.Empty;
    public int LogicalCores { get; set; }
    public int PhysicalCores { get; set; }
    public Dictionary<string, string> EnvironmentVariables { get; set; } = new();
}

public class RunnerGpuInfo
{
    public string Name { get; set; } = string.Empty;
    public long VramBytes { get; set; }
    public string DriverVersion { get; set; } = string.Empty;
    public string PciBus { get; set; } = string.Empty;
}

public class RunnerDiskInfo
{
    public string Mount { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public long TotalBytes { get; set; }
    public long FreeBytes { get; set; }
    public string FsType { get; set; } = string.Empty;
}
