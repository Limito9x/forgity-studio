namespace Automation.Runner.Contracts;

public class RunnerDccSessionDto
{
    public string Key { get; set; } = string.Empty;
    public string Executor { get; set; } = string.Empty;
    public string? ProjectPath { get; set; }
    public uint Pid { get; set; }
    public string State { get; set; } = string.Empty;
    public ulong StartedAtSecs { get; set; }
    public long RemainingSeconds { get; set; }
    public uint KeepAliveMinutes { get; set; }
}

public class StopRunnerDccSessionRequest
{
    public string? Key { get; set; }
    public bool All { get; set; }
}

public class StopRunnerDccSessionResponseDto
{
    public int Stopped { get; set; }
}

