namespace Automation.Workspace.Constants;

public static class WorkspaceRoutes
{
    public const string NestedRepositories = "/projects/{projectId:guid}/repositories";
    public const string Repositories = "/repositories";
    public const string Repository = "/repositories/{id:guid}";
    public const string AttachRunner = "/repositories/{repositoryId:guid}/runners";
    public const string RepositoryResources = "/repositories/{repositoryId:guid}/resources";
    public const string RepositoryRunnerResources = "/repositories/{repositoryId:guid}/runners/{runnerId:guid}/resources";
    public const string AssignResourcesContent = "/repositories/resources/assign-content";
    public const string ContentResources = "/repositories/resources/by-content/{contentId:guid}";

    // Backward-compatible aliases
    public const string NestedWorkspaces = "/workspaces";
    public const string Workspaces = "/workspaces";
    public const string Workspace = "/workspaces/{id:guid}";
    public const string AttachAgent = "/workspaces/{workspaceId:guid}/agents";
    public const string ScanFiles = "/workspaces/{workspaceId:guid}/agents/{agentId:guid}/scan-files";
    public const string WorkspaceResources = "/repositories/{repositoryId:guid}/resources";
    public const string WorkspaceAgentResources = "/repositories/{repositoryId:guid}/runners/{runnerId:guid}/resources";
}
