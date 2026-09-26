namespace Automation.Runner.Contracts;

public record RunnerScanItemDto(
    string RelativePath,
    string Hash,
    long SizeBytes
);

public record RunnerScanResultDto(
    string CommandId,
    bool Success,
    string? ErrorMessage,
    IReadOnlyList<RunnerScanItemDto>? Items
);

public record RunnerBrowseItemDto(
    string Name,
    string Path,
    bool IsDirectory,
    long SizeBytes
);

public record RunnerBrowseResultDto(
    string CommandId,
    bool Success,
    string? ErrorMessage,
    string CurrentPath,
    string ParentPath,
    bool CanNavigateUp,
    IReadOnlyList<RunnerBrowseItemDto>? Items
);

// Backward-compatibility aliases
public record AgentScanItemDto(string RelativePath, string Hash, long SizeBytes)
    : RunnerScanItemDto(RelativePath, Hash, SizeBytes);

public record AgentScanResultDto(
    string CommandId,
    bool Success,
    string? ErrorMessage,
    IReadOnlyList<AgentScanItemDto>? Items
);

public record AgentBrowseItemDto(string Name, string Path, bool IsDirectory, long SizeBytes)
    : RunnerBrowseItemDto(Name, Path, IsDirectory, SizeBytes);

public record AgentBrowseResultDto(
    string CommandId,
    bool Success,
    string? ErrorMessage,
    string CurrentPath,
    string ParentPath,
    bool CanNavigateUp,
    IReadOnlyList<AgentBrowseItemDto>? Items
);
