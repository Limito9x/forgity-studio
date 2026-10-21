namespace Automation.Runner.Contracts;

public record ExecuteCommandResponseDto(
    int ExitCode,
    string Stdout,
    string Stderr,
    bool TimedOut,
    bool Success,
    string? ErrorMessage
);
