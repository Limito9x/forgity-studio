using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Repository.Contracts;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Tools.Workspaces;

/// <summary>
/// Tool query the absolute root path of a repository on a given runner.
/// </summary>
public class GetRepositoryInfoTool(
    IRepositoryApi repositoryApi,
    ILogger<GetRepositoryInfoTool> logger
) : IResolverTool
{
    public string Key => "GetRepositoryInfo";
    public string Label => "Get Repository Info";
    public string? Category => "Workspaces";
    public bool IsPure => false;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Runner",
            Label = "Runner",
            PrimitiveType = PinPrimitiveType.EntityRef,
            EntityTarget = "Runner",
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Metadata = """{"type": "entity-select", "properties": {"entity": "Runner"}}"""
        },
        new()
        {
            Id = "Repository",
            Label = "Repository",
            PrimitiveType = PinPrimitiveType.EntityRef,
            EntityTarget = "Workspace",
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Metadata = """{"type": "entity-select", "properties": {"entity": "Workspace"}}"""
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "RootPath",
            Label = "Root Path",
            PrimitiveType = PinPrimitiveType.Path,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        },
        new()
        {
            Id = "RepositoryId",
            Label = "Repository ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        },
        new()
        {
            Id = "RepositoryName",
            Label = "Repository Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        // 1. Resolve Runner ID
        var rawRunner = inputs.GetValueOrDefault("Runner");
        var (_, runnerId, isRunnerValid) = EntityRefHelper.Parse(rawRunner);

        if (!isRunnerValid || runnerId == Guid.Empty)
        {
            throw new InvalidOperationException("GetRepositoryInfoTool requires a valid Runner entity reference.");
        }

        // 2. Resolve Repository ID
        var rawRepo = inputs.GetValueOrDefault("Repository") ?? inputs.GetValueOrDefault("Workspace");
        var (_, repositoryId, isRepoValid) = EntityRefHelper.Parse(rawRepo);

        if (!isRepoValid || repositoryId == Guid.Empty)
        {
            throw new InvalidOperationException("GetRepositoryInfoTool requires a valid Repository / Workspace entity reference.");
        }

        // 3. Query Root Path via IRepositoryApi
        var pathResult = await repositoryApi.GetRepositoryRootPathAsync(repositoryId, runnerId, context.CancellationToken);
        if (pathResult.IsFailed)
        {
            throw new InvalidOperationException($"Failed to resolve repository root path for Repo '{repositoryId}' on Runner '{runnerId}': {string.Join(", ", pathResult.Errors.Select(e => e.Message))}");
        }

        var rootPath = pathResult.Value;

        // 4. Query Repository Name
        string repoName = string.Empty;
        var namesResult = await repositoryApi.GetRepositoryNamesAsync([repositoryId], context.CancellationToken);
        if (namesResult.IsSuccess && namesResult.Value.TryGetValue(repositoryId, out var name))
        {
            repoName = name;
        }

        logger.LogInformation("GetRepositoryInfoTool: Resolved Repo '{RepoName}' ({RepoId}) on Runner '{RunnerId}' -> RootPath: '{RootPath}'",
            repoName, repositoryId, runnerId, rootPath);

        return new Dictionary<string, object>
        {
            ["RootPath"] = rootPath,
            ["RepositoryId"] = repositoryId.ToString(),
            ["RepositoryName"] = repoName
        };
    }
}
