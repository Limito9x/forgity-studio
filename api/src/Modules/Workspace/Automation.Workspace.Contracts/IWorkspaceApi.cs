using FluentResults;

namespace Automation.Workspace.Contracts;

public interface IRepositoryApi
{
    Task<Result<ResourceLocationInfoDto>> GetResourceLocationAsync(
        Guid resourceVersionId,
        CancellationToken ct = default
    );

    Task<Result<Dictionary<string, ResourceLocationInfoDto>>> GetResourceLocationsAsync(
        IEnumerable<Guid> resourceVersionIds,
        Guid runnerId,
        CancellationToken ct = default
    );

    Task<Result<SyncLocalChangesResultDto>> SyncLocalChangesAsync(
        Guid repositoryId,
        Guid runnerId,
        List<string> targetPaths,
        string? notes = null,
        CancellationToken ct = default
    );

    Task<Result<List<Guid>>> GetUncoveredRepositoriesAsync(
        Guid runnerId,
        IEnumerable<Guid> requiredRepositoryIds,
        CancellationToken ct = default
    );

    Task<Result<Dictionary<Guid, string>>> GetRepositoryNamesAsync(
        IEnumerable<Guid> repositoryIds,
        CancellationToken ct = default
    );

    Task<Result<string>> GetRepositoryRootPathAsync(
        Guid repositoryId,
        Guid runnerId,
        CancellationToken ct = default
    );

    Task<Result> UpdateMetadataAsync(
        Guid resourceVersionId,
        System.Text.Json.JsonDocument? metadata,
        CancellationToken ct = default
    );

    Task<Result<System.Text.Json.JsonDocument?>> GetMetadataAsync(
        Guid resourceVersionId,
        CancellationToken ct = default
    );

    Task<Result<Dtos.ResourceMetadataDetailDto>> GetMetadataDetailWithTagsAsync(
        Guid resourceVersionId,
        CancellationToken ct = default
    );

    Task<Result<Dictionary<Guid, Dtos.ResourceBatchItemDto>>> GetBatchResourceDetailsAsync(
        IEnumerable<Guid> resourceOrVersionIds,
        CancellationToken ct = default
    );

    Task<Result> AssignResourceToContentAsync(
        Guid ContentId,
        List<Guid> resourceIds,
        CancellationToken ct = default
    );
}

public interface IWorkspaceApi : IRepositoryApi
{
    Task<Result<List<Guid>>> GetUncoveredWorkspacesAsync(
        Guid agentId,
        IEnumerable<Guid> requiredWorkspaceIds,
        CancellationToken ct = default
    ) => GetUncoveredRepositoriesAsync(agentId, requiredWorkspaceIds, ct);

    Task<Result<Dictionary<Guid, string>>> GetWorkspaceNamesAsync(
        IEnumerable<Guid> workspaceIds,
        CancellationToken ct = default
    ) => GetRepositoryNamesAsync(workspaceIds, ct);

    Task<Result<string>> GetWorkspaceRootPathAsync(
        Guid workspaceId,
        Guid agentId,
        CancellationToken ct = default
    ) => GetRepositoryRootPathAsync(workspaceId, agentId, ct);
}

public record SyncLocalChangesResultDto(
    Guid RepositoryId,
    Guid RunnerId,
    int AddedCount,
    int ModifiedCount,
    int LocationRemoved,
    List<Guid> ResourceVersionIds,
    Dictionary<string, Guid> SyncedResources
)
{
    public Guid WorkspaceId => RepositoryId;
    public Guid AgentId => RunnerId;
}

public record ResourceLocationInfoDto(
    Guid ResourceVersionId,
    Guid ResourceId,
    string RelativePath,
    string? FileHash,
    Guid? RunnerId,
    string? RunnerRootPath,
    Guid? ContentId = null
)
{
    public Guid? AgentId => RunnerId;
    public string? AgentRootPath => RunnerRootPath;

    public string? FullLocalPath
    {
        get
        {
            if (string.IsNullOrWhiteSpace(RelativePath))
                return null;

            if (!string.IsNullOrWhiteSpace(RunnerRootPath))
            {
                var cleanRel = RelativePath.TrimStart('/', '\\');
                return Path.Combine(RunnerRootPath, cleanRel).Replace('\\', '/');
            }

            return RelativePath;
        }
    }
}
