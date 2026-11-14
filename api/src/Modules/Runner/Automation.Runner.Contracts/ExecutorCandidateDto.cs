namespace Automation.Runner.Contracts;

public record ExecutorCandidateDto(
    string ExecutorKey,
    string ExecutablePath,
    string Version
);
