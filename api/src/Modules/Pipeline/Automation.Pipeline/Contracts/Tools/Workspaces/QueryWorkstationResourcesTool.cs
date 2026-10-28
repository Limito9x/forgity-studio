using System.Collections;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Runtime.State.EntityStore;
using Automation.Repository.Contracts;
using Automation.Repository.Contracts.Dtos;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Contracts.Tools.Workspaces;

/// <summary>
/// Tool truy vấn tài nguyên từ Workstation (Repository + Runner) thông qua cơ sở dữ liệu.
/// Đóng vai trò là Source Node trong DAG, nạp danh sách Resources vào ExecutionEntityStore.
/// </summary>
public class QueryWorkstationResourcesTool(
    IRepositoryApi repositoryApi,
    IExecutionEntityStore? entityStore = null,
    ILogger<QueryWorkstationResourcesTool>? logger = null
) : IResolverTool
{
    public string Key => "QueryWorkstationResources";
    public IReadOnlyList<string> Aliases => ["GetWorkstationResources", "FetchResources", "QueryResources"];
    public string Label => "Query Workstation Resources";
    public string? Category => "Workspaces & Resources";
    public string? Description => "Queries resources from a Workstation (Repository + Runner) and populates Resource entity references into the pipeline DAG.";
    public bool IsPure => false;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Workstation",
            Label = "Workstation",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Workstation,
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Description = "Target Workstation (Pair of Repository + Runner with Root Path)"
        },
        new()
        {
            Id = "Extension",
            Label = "Extension",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            DefaultValue = "",
            Description = "Optional file extension to pre-filter at database level (e.g. .duf, .fbx, .blend)"
        },
        new()
        {
            Id = "Keyword",
            Label = "Keyword",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            DefaultValue = "",
            Description = "Optional keyword to filter by file name or relative path"
        },
        new()
        {
            Id = "Limit",
            Label = "Limit",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            DefaultValue = 100,
            Description = "Maximum number of resources to retrieve"
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "Resources",
            Label = "Resources",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Resource,
            Cardinality = PinCardinality.Array,
            IsRequired = true,
            Description = "List of all queried Resource entity references"
        },
        new()
        {
            Id = "Count",
            Label = "Count",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Description = "Total number of resources retrieved"
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;

        Guid? repositoryId = null;
        Guid? repositoryRunnerId = null;
        Guid? runnerId = null;

        var wsInput = inputs.GetValueOrDefault("Workstation")
                      ?? inputs.GetValueOrDefault("workstation");

        if (wsInput != null)
        {
            var (_, wsGuid, isValid) = EntityRefHelper.Parse(wsInput);
            if (!isValid && Guid.TryParse(wsInput.ToString(), out var parsedGuid))
            {
                wsGuid = parsedGuid;
                isValid = true;
            }

            if (isValid && wsGuid != Guid.Empty)
            {
                var wsResult = await repositoryApi.GetWorkstationByIdAsync(wsGuid, ct);
                if (wsResult.IsSuccess && wsResult.Value != null)
                {
                    repositoryId = wsResult.Value.RepositoryId;
                    runnerId = wsResult.Value.RunnerId;
                    repositoryRunnerId = wsResult.Value.WorkstationId;
                }
            }
        }

        var ext = inputs.GetValueOrDefault("Extension")?.ToString()?.Trim() ?? string.Empty;
        var keyword = inputs.GetValueOrDefault("Keyword")?.ToString()?.Trim() ?? string.Empty;
        var limit = 100;
        var limitObj = inputs.GetValueOrDefault("Limit");
        if (limitObj != null && int.TryParse(limitObj.ToString(), out var parsedLimit) && parsedLimit > 0)
        {
            limit = parsedLimit;
        }

        var filter = new ResourceQueryFilter(
            RepositoryId: repositoryId,
            RepositoryRunnerId: repositoryRunnerId,
            RunnerId: runnerId,
            Extension: ext,
            Keyword: keyword,
            Limit: limit
        );

        var queryResult = await repositoryApi.QueryResourcesAsync(filter, ct);
        if (queryResult.IsFailed || queryResult.Value == null)
        {
            throw new InvalidOperationException(
                $"Failed to query resources: {string.Join(", ", queryResult.Errors.Select(e => e.Message))}"
            );
        }

        var resources = queryResult.Value;

        // Cache vào ExecutionEntityStore để các node hạ nguồn tra cứu O(1)
        var entityRefs = new List<object>();
        foreach (var r in resources)
        {
            var entityRef = EntityRefHelper.Create(WellKnownStructTypes.Resource, r.ResourceId);
            entityRefs.Add(entityRef);

            if (entityStore != null)
            {
                entityStore.SetProperties(WellKnownStructTypes.Resource, r.ResourceId, new Dictionary<string, object?>
                {
                    ["ResourceId"] = r.ResourceId,
                    ["FileName"] = r.DisplayName,
                    ["BaseName"] = Path.GetFileNameWithoutExtension(r.DisplayName),
                    ["Extension"] = r.Extension,
                    ["RelativePath"] = r.RelativePath,
                    ["FullPath"] = r.FullLocalPath ?? string.Empty,
                    ["MountPath"] = r.MountPath ?? string.Empty,
                    ["HoldingRunnerId"] = r.RunnerId?.ToString() ?? string.Empty,
                    ["RepositoryId"] = r.RepositoryId,
                    ["FileHash"] = r.FileHash ?? string.Empty,
                    ["ContentId"] = r.ContentId?.ToString() ?? string.Empty,
                    ["Metadata"] = r.MetadataJson ?? string.Empty
                });
            }
        }

        logger?.LogInformation(
            "QueryWorkstationResources: Retrieved {Count} resource(s) from Workstation '{WsId}'",
            resources.Count,
            wsInput
        );

        return new Dictionary<string, object>
        {
            ["Resources"] = entityRefs,
            ["Count"] = resources.Count
        };
    }
}
