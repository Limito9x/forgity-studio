namespace Automation.Repository.Contracts;

public record ResourceVersionCreatedInfo(
    Guid ResourceVersionId,
    string Extension,
    Guid? ContentId = null,
    string? RelativePath = null
);

public record ResourcesCreatedEvent(
    Guid ProjectId,
    Guid RepositoryId,
    Guid RunnerId,
    List<ResourceVersionCreatedInfo> ResourceVersions
)
{
    public Guid WorkspaceId => RepositoryId;
    public Guid AgentId => RunnerId;
    public List<Guid> ResourceVersionIds => ResourceVersions.Select(r => r.ResourceVersionId).ToList();
}
