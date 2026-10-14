namespace Automation.Repository.Contracts;

public record ResourceVersionPublishedEvent(
    Guid ProjectId,
    Guid RepositoryId,
    Guid ResourceId,
    Guid ResourceVersionId,
    int VersionNo,
    string? Notes
);
