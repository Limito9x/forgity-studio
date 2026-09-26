using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Engine.StructRegistry.Definitions;

public class WorkspaceStructDefinition(IRepositoryApi workspaceApi) : IEntityStructDefinition
{
    public string StructType => "Workspace";
    public string Label => "Workspace";

    public IReadOnlyList<PinDefinition> OutputPins =>
    [
        new()
        {
            Id = "WorkspaceId",
            Label = "Workspace ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "WorkspaceName",
            Label = "Workspace Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "RootPath",
            Label = "Root Path",
            PrimitiveType = PinPrimitiveType.Path,
            Cardinality = PinCardinality.Single
        }
    ];

    public async Task<Dictionary<string, object>> ResolveAsync(
        object targetInput,
        ToolExecutionContext context
    )
    {
        var (type, wsId, isValid) = EntityRefHelper.Parse(targetInput);
        if (!isValid || wsId == Guid.Empty)
        {
            throw new ArgumentException($"Invalid Target Workspace Reference: '{targetInput}'");
        }

        var ct = context.CancellationToken;

        var rootResult = await workspaceApi.GetWorkspaceRootPathAsync(wsId, context.AgentId, ct);
        if (rootResult.IsFailed)
        {
            var errMsg = string.Join(", ", rootResult.Errors.Select(e => e.Message));
            throw new InvalidOperationException($"Failed to get root path for Workspace '{wsId}': {errMsg}");
        }

        var namesResult = await workspaceApi.GetWorkspaceNamesAsync([wsId], ct);
        var wsName = namesResult.IsSuccess && namesResult.Value.TryGetValue(wsId, out var name)
            ? name
            : wsId.ToString();

        return new Dictionary<string, object>
        {
            ["WorkspaceId"] = wsId,
            ["WorkspaceName"] = wsName,
            ["RootPath"] = rootResult.Value
        };
    }
}
