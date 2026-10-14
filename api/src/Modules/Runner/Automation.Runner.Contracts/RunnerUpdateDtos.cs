namespace Automation.Runner.Contracts;

public record RunnerUpdateResultDto(
    string CurrentVersion,
    string UpdatedVersion,
    bool RestartScheduled
);
