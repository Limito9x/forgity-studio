using Automation.Runner.Contracts;

namespace Automation.Workspace.Shared.Dtos;

public record WorkspaceDto(
    Guid Id,
    Guid ProjectId,
    string Name,
    int AgentCount,
    int ResourceCount,
    DateTimeOffset CreatedAt,
    IReadOnlyList<Guid>? PlatformIds = null
);

public record ResourceItemDto(
    Guid Id,
    Guid ProjectId,
    Guid WorkspaceId,
    string Name,
    string? FilePath,
    Guid? PlatformExtensionId,
    Guid? ContentId,
    DateTimeOffset CreatedAt,
    IReadOnlyList<ResourceVersionDto>? Versions = null
);

public record WorkspaceAgentDto(
    Guid Id,
    Guid AgentId,
    string RootPath,
    DateTimeOffset CreatedAt,
    DateTimeOffset? LastSyncAt,
    RunnerDto? Agent = null
);

public record ResourceVersionLocationDto(
    Guid Id,
    Guid ResourceVersionId,
    Guid WorkspaceAgentId,
    string RelativePath,
    bool IsOrigin,
    DateTimeOffset DiscoveredAt,
    DateTimeOffset CreatedAt
);

public record ScannedFileItemDto(string RelativePath, string Hash, long SizeBytes);

public record ScanWorkspaceFilesResultDto(
    string TargetPath,
    int TotalCount,
    IReadOnlyList<ScannedFileItemDto> Files
);

public record DirectoryNodeDto(
    string Name,
    string Path,
    bool IsDirectory,
    long SizeBytes,
    bool HasChildren = false
);

public record BrowseDirectoryResultDto(
    string CurrentPath,
    string ParentPath,
    bool CanNavigateUp,
    IReadOnlyList<DirectoryNodeDto> Items
);

public record WorkspaceResourceDto(
    Guid Id,
    Guid WorkspaceId,
    string DisplayName,
    string? RelativePath,
    Guid? PlatformExtensionId,
    Guid? ContentId,
    string? ContentName,
    string? ContentTypeName,
    string? ContentTypeColor,
    string? ContentTypeIcon,
    int VersionCount,
    DateTimeOffset CreatedAt,
    Guid? LatestVersionId = null,
    int? LatestVersionNo = null
);

public record WorkspaceAgentResourceDto(
    Guid ResourceId,
    string ResourceName,
    string RelativePath,
    int VersionNo,
    bool IsOrigin,
    string? FileHash,
    DateTimeOffset DiscoveredAt,
    Guid? ContentId,
    string? ContentName,
    string? ContentTypeName,
    string? ContentTypeColor
);

public record ResourceVersionDto(
    Guid Id,
    int VersionNo,
    long SizeBytes,
    string FileHash,
    string? Notes,
    DateTimeOffset CreatedAt,
    System.Text.Json.JsonDocument? Metadata = null,
    IReadOnlyDictionary<string, IReadOnlyList<Automation.Tag.Contracts.Dtos.TagLinkDetailDto>>? TagsByPath = null
);

public record ResourceDiffItem(
    string RelativePath,
    string Name,
    string? LocalHash,
    long? LocalFileSize,
    Guid PlatformExtensionId,
    ResourceVersionDto? RemoteVersion
);

public record DiffResult(
    Guid WorkspaceAgentId,
    List<ResourceDiffItem> Added,
    List<ResourceDiffItem> Modified,
    List<ResourceDiffItem> Deleted,
    List<ResourceDiffItem> Missing
);

public record ContentResourceDto(
    Guid Id,
    Guid WorkspaceId,
    string WorkspaceName,
    string DisplayName,
    string RelativePath,
    Guid PlatformExtensionId,
    int LatestVersionNo,
    long LatestSizeBytes,
    int VersionCount,
    DateTimeOffset CreatedAt
);
