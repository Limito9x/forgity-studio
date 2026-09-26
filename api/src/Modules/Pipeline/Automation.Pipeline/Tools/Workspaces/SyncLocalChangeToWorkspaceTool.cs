using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Tools.Workspaces;

public class SyncLocalChangeToWorkspaceTool(IRepositoryApi workspaceApi) : IResolverTool
{
    public string Key => "SyncLocalChangeToWorkspace";
    public string Label => "Sync Local Change To Workspace";
    public string? Category => "Workspace";

    public IReadOnlyList<PinDefinition> Inputs =>
        new List<PinDefinition>
        {
            new PinDefinition
            {
                Id = "WorkspaceId",
                Label = "Target Workspace",
                PrimitiveType = PinPrimitiveType.EntityRef,
                EntityTarget = "workspace",
                Cardinality = PinCardinality.Single,
                IsRequired = true,
                Metadata = """{"type": "entity-select", "properties": {"entity": "Workspace"}}""",
            },
            new PinDefinition
            {
                Id = "RelativePaths",
                Label = "Relative Paths",
                PrimitiveType = PinPrimitiveType.Path,
                Cardinality = PinCardinality.Array,
                IsRequired = true,
            },
            new PinDefinition
            {
                Id = "Notes",
                Label = "Notes",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
                IsRequired = false,
                DefaultValue = "Sync from Pipeline",
            }
        };

    public IReadOnlyList<PinDefinition> Outputs =>
        new List<PinDefinition>
        {
            new PinDefinition
            {
                Id = "AddedCount",
                Label = "Added Count",
                PrimitiveType = PinPrimitiveType.Number,
                Cardinality = PinCardinality.Single,
                IsRequired = true,
            },
            new PinDefinition
            {
                Id = "ModifiedCount",
                Label = "Modified Count",
                PrimitiveType = PinPrimitiveType.Number,
                Cardinality = PinCardinality.Single,
                IsRequired = true,
            },
            new PinDefinition
            {
                Id = "LocationRemoved",
                Label = "Location Removed",
                PrimitiveType = PinPrimitiveType.Number,
                Cardinality = PinCardinality.Single,
                IsRequired = true,
            },
            new PinDefinition
            {
                Id = "ResourceMap",
                Label = "Path to Resource Map",
                PrimitiveType = PinPrimitiveType.EntityRef,
                EntityTarget = "resource",
                Cardinality = PinCardinality.Map,
                IsRequired = false,
            },
            new PinDefinition
            {
                Id = "AbsolutePathMap",
                Label = "Absolute Path Map",
                PrimitiveType = PinPrimitiveType.EntityRef,
                EntityTarget = "resource",
                Cardinality = PinCardinality.Map,
                IsRequired = false,
            },
            new PinDefinition
            {
                Id = "FirstResource",
                Label = "First Resource",
                PrimitiveType = PinPrimitiveType.EntityRef,
                EntityTarget = "resource",
                Cardinality = PinCardinality.Single,
                IsRequired = false,
            },
            new PinDefinition
            {
                Id = "Resources",
                Label = "Resources",
                PrimitiveType = PinPrimitiveType.EntityRef,
                EntityTarget = "resource",
                Cardinality = PinCardinality.Array,
                IsRequired = false,
            },
        };

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var workspaceId = inputs.TryGetValue("WorkspaceId", out var wVal) && wVal is Guid wGuid
            ? wGuid
            : EntityRefHelper.ExtractRefId(inputs.GetValueOrDefault("WorkspaceId"));

        if (workspaceId == null)
            throw new ArgumentException("WorkspaceId is required.");

        var agentId = context.AgentId;
        if (agentId == Guid.Empty)
            throw new ArgumentException("AgentId in execution context cannot be empty.");

        var targetPaths = new List<string>();
        var rawPaths = inputs.GetValueOrDefault("RelativePaths")
            ?? inputs.GetValueOrDefault("Paths")
            ?? inputs.GetValueOrDefault("TargetPaths");

        if (rawPaths != null)
        {
            if (rawPaths is IEnumerable<string> strEnumerable)
            {
                targetPaths.AddRange(strEnumerable.Where(x => !string.IsNullOrWhiteSpace(x)));
            }
            else if (rawPaths is string strSingle)
            {
                if (!string.IsNullOrWhiteSpace(strSingle))
                    targetPaths.Add(strSingle);
            }
            else if (rawPaths is JsonElement jsonElement)
            {
                if (jsonElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in jsonElement.EnumerateArray())
                    {
                        var val = item.GetString();
                        if (!string.IsNullOrWhiteSpace(val))
                            targetPaths.Add(val);
                    }
                }
                else if (jsonElement.ValueKind == JsonValueKind.String)
                {
                    var val = jsonElement.GetString();
                    if (!string.IsNullOrWhiteSpace(val))
                        targetPaths.Add(val);
                }
            }
            else if (rawPaths is IEnumerable enumerable)
            {
                foreach (var item in enumerable)
                {
                    var str = item?.ToString();
                    if (!string.IsNullOrWhiteSpace(str))
                        targetPaths.Add(str);
                }
            }
        }

        var notes = inputs.TryGetValue("Notes", out var nObj) && nObj != null
            ? nObj.ToString()
            : "Sync from Pipeline";

        var result = await workspaceApi.SyncLocalChangesAsync(
            workspaceId.Value,
            agentId,
            targetPaths,
            notes,
            context.CancellationToken
        );

        if (result.IsFailed)
            throw new InvalidOperationException(string.Join(", ", result.Errors.Select(e => e.Message)));

        // Lấy rootPath của workspace nếu có để xây dựng AbsolutePathMap
        var rootResult = await workspaceApi.GetWorkspaceRootPathAsync(workspaceId.Value, agentId, context.CancellationToken);
        var rootPath = rootResult.IsSuccess ? rootResult.Value : null;

        var syncedDict = result.Value.SyncedResources ?? new Dictionary<string, Guid>();
        var resourceMap = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        var absolutePathMap = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        var versionIdList = result.Value.ResourceVersionIds ?? new List<Guid>();

        foreach (var (k, v) in syncedDict)
        {
            var entityRef = EntityRefHelper.Create("ResourceVersion", v);
            resourceMap[k] = entityRef;
            resourceMap[k.Replace('\\', '/')] = entityRef;
            resourceMap[k.Replace('/', '\\')] = entityRef;

            var isRooted = Path.IsPathRooted(k) || (k.Length > 2 && k[1] == ':');
            if (isRooted)
            {
                absolutePathMap[k] = entityRef;
                absolutePathMap[k.Replace('\\', '/')] = entityRef;
                absolutePathMap[k.Replace('/', '\\')] = entityRef;
            }
            else if (!string.IsNullOrWhiteSpace(rootPath))
            {
                var full = Path.Combine(rootPath, k.TrimStart('/', '\\'));
                absolutePathMap[full] = entityRef;
                absolutePathMap[full.Replace('\\', '/')] = entityRef;
                absolutePathMap[full.Replace('/', '\\')] = entityRef;

                // Đồng thời cho cả vào resourceMap chung để tra cứu bằng full path
                resourceMap[full] = entityRef;
                resourceMap[full.Replace('\\', '/')] = entityRef;
                resourceMap[full.Replace('/', '\\')] = entityRef;
            }
        }

        if (versionIdList.Count == 0 && syncedDict.Count > 0)
        {
            versionIdList = syncedDict.Values.Distinct().ToList();
        }

        var firstResource = versionIdList.Count > 0
            ? EntityRefHelper.Create("ResourceVersion", versionIdList[0])
            : (resourceMap.Values.FirstOrDefault() ?? null);

        var resourcesArray = versionIdList
            .Select(id => (object)EntityRefHelper.Create("ResourceVersion", id))
            .ToArray();

        return new Dictionary<string, object>
        {
            ["AddedCount"] = result.Value.AddedCount,
            ["ModifiedCount"] = result.Value.ModifiedCount,
            ["LocationRemoved"] = result.Value.LocationRemoved,
            ["ResourceMap"] = resourceMap,
            ["AbsolutePathMap"] = absolutePathMap,
            ["FirstResource"] = firstResource ?? (object)"",
            ["Resources"] = resourcesArray,
        };
    }
}
