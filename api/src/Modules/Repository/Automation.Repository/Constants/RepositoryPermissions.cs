using Automation.SharedKernel.Abstractions.Auth;

namespace Automation.Repository.Constants;

public class RepositoryPermissions
{
    public static RepositoryFeature Repository { get; } = new();
    public static RepositoryRunnerFeature RepositoryRunner { get; } = new();
    public static ResourceFeature Resource { get; } = new();

    // Backward-compatible aliases
    public static RepositoryFeature Workspace => Repository;
    public static RepositoryRunnerFeature WorkspaceAgent => RepositoryRunner;

    public Dictionary<string, IReadOnlyList<string>> GetPermissions() => new()
    {
        { "Repository", Repository.All },
        { "RepositoryRunner", RepositoryRunner.All },
        { "Resource", Resource.All }
    };

    public class RepositoryFeature() : BaseCrudPermission("repositories") { }
    public class RepositoryRunnerFeature() : BaseCrudPermission("repository_runners") { }
    public class ResourceFeature() : BaseCrudPermission("resource") { }
}
