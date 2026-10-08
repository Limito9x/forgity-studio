using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Tools.Workspaces;

/// <summary>
/// Tool phát hiện và đồng bộ các thay đổi file cục bộ (relative paths) từ Repository Runner vào Database.
/// Hoạt động thuần túy trên đường dẫn tương đối (Relative Path), độc lập với Root Path cục bộ của máy Runner.
/// </summary>
public class SyncLocalChangeToRepositoryTool(IRepositoryApi repositoryApi) : IResolverTool
{
    public string Key => "SyncLocalChangeToRepository";
    public IReadOnlyList<string> Aliases => ["SyncLocalChangeToWorkspace", "SyncLocalChanges"];
    public string Label => "Sync Local Change To Repository";
    public string? Category => "Repository";

    public IReadOnlyList<PinDefinition> Inputs =>
        new List<PinDefinition>
        {
            new PinDefinition
            {
                Id = "Repository",
                Label = "Target Repository",
                PrimitiveType = PinPrimitiveType.EntityRef,
                EntityTarget = "Repository",
                Cardinality = PinCardinality.Single,
                IsRequired = true,
                Metadata = """{"type": "entity-select", "properties": {"entity": "Repository"}}""",
            },
            new PinDefinition
            {
                Id = "Runner",
                Label = "Target Runner",
                PrimitiveType = PinPrimitiveType.EntityRef,
                EntityTarget = "Runner",
                Cardinality = PinCardinality.Single,
                IsRequired = true,
                Metadata = """{"type": "entity-select", "properties": {"entity": "Runner"}}""",
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
            },
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
                EntityTarget = "Resource",
                Cardinality = PinCardinality.Map,
                IsRequired = false,
            },
            new PinDefinition
            {
                Id = "FirstResource",
                Label = "First Resource",
                PrimitiveType = PinPrimitiveType.EntityRef,
                EntityTarget = "Resource",
                Cardinality = PinCardinality.Single,
                IsRequired = false,
            },
            new PinDefinition
            {
                Id = "Resources",
                Label = "Resources",
                PrimitiveType = PinPrimitiveType.EntityRef,
                EntityTarget = "Resource",
                Cardinality = PinCardinality.Array,
                IsRequired = false,
            },
        };

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        // 1. Resolve Target Repository (hỗ trợ nhiều alias/fallback keys)
        var repoObj =
            inputs.GetValueOrDefault("Repository")
            ?? inputs.GetValueOrDefault("RepositoryId")
            ?? inputs.GetValueOrDefault("TargetRepository")
            ?? inputs.GetValueOrDefault("Workspace")
            ?? inputs.GetValueOrDefault("WorkspaceId");

        var repositoryId = EntityRefHelper.ExtractRefId(repoObj);
        if (repositoryId == null || repositoryId == Guid.Empty)
            throw new ArgumentException("Repository ID is required and must be a valid entity reference or GUID.");

        // 2. Resolve Target Runner
        var runnerObj =
            inputs.GetValueOrDefault("Runner")
            ?? inputs.GetValueOrDefault("RunnerId")
            ?? inputs.GetValueOrDefault("TargetRunner")
            ?? inputs.GetValueOrDefault("TargetRunnerId");

        var runnerId = EntityRefHelper.ExtractRefId(runnerObj);
        if (runnerId == null || runnerId == Guid.Empty)
            throw new ArgumentException("Runner ID is required and must be a valid entity reference or GUID.");

        // 3. Resolve & Normalize Relative Paths (bỏ qua rỗng, loại bỏ leading slashes, chỉ giữ relative)
        var rawPaths =
            inputs.GetValueOrDefault("RelativePaths")
            ?? inputs.GetValueOrDefault("Paths")
            ?? inputs.GetValueOrDefault("TargetPaths")
            ?? inputs.GetValueOrDefault("relative_paths");

        var targetPaths = ExtractNormalizedRelativePaths(rawPaths);

        var notes =
            inputs.TryGetValue("Notes", out var nObj) && nObj != null
                ? nObj.ToString()
                : "Sync from Pipeline";

        // 4. Invoke Sync qua IRepositoryApi
        var result = await repositoryApi.SyncLocalChangesAsync(
            repositoryId.Value,
            runnerId.Value,
            targetPaths,
            notes,
            context.CancellationToken
        );

        if (result.IsFailed)
            throw new InvalidOperationException(
                string.Join(", ", result.Errors.Select(e => e.Message))
            );

        // 5. Chuẩn hóa ResourceMap: Chỉ ánh xạ các RelativePath chuẩn -> Resource EntityRef
        var syncedDict = result.Value.SyncedResources ?? new Dictionary<string, Guid>();
        var resourceMap = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        var versionIdList = result.Value.ResourceVersionIds ?? new List<Guid>();

        foreach (var (k, v) in syncedDict)
        {
            if (string.IsNullOrWhiteSpace(k) || v == Guid.Empty)
                continue;

            // Bỏ qua nếu đường dẫn là absolute path (bắt đầu bằng ổ đĩa C: hoặc /)
            if (Path.IsPathRooted(k) || (k.Length > 2 && k[1] == ':'))
                continue;

            var cleanRel = NormalizeRelativePath(k);
            var entityRef = EntityRefHelper.Create("Resource", v);

            // Cho phép tra cứu bằng cả 2 kiểu phân cách '/' và '\'
            resourceMap[cleanRel] = entityRef;
            resourceMap[cleanRel.Replace('/', '\\')] = entityRef;
        }

        if (versionIdList.Count == 0 && syncedDict.Count > 0)
        {
            versionIdList = syncedDict.Values.Distinct().ToList();
        }

        var firstResource =
            versionIdList.Count > 0
                ? EntityRefHelper.Create("Resource", versionIdList[0])
                : (resourceMap.Values.FirstOrDefault() ?? (object)"");

        var resourcesArray = versionIdList
            .Select(id => (object)EntityRefHelper.Create("Resource", id))
            .ToArray();

        return new Dictionary<string, object>
        {
            ["AddedCount"] = result.Value.AddedCount,
            ["ModifiedCount"] = result.Value.ModifiedCount,
            ["LocationRemoved"] = result.Value.LocationRemoved,
            ["ResourceMap"] = resourceMap,
            ["FirstResource"] = firstResource,
            ["Resources"] = resourcesArray,
        };
    }

    private static List<string> ExtractNormalizedRelativePaths(object? raw)
    {
        var list = new List<string>();
        if (raw == null) return list;

        void AddIfValid(string? path)
        {
            if (string.IsNullOrWhiteSpace(path)) return;
            var normalized = NormalizeRelativePath(path);
            if (!string.IsNullOrWhiteSpace(normalized))
            {
                list.Add(normalized);
            }
        }

        if (raw is IEnumerable<string> strEnumerable)
        {
            foreach (var s in strEnumerable) AddIfValid(s);
        }
        else if (raw is string strSingle)
        {
            AddIfValid(strSingle);
        }
        else if (raw is JsonElement jsonElement)
        {
            if (jsonElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in jsonElement.EnumerateArray())
                {
                    AddIfValid(item.GetString());
                }
            }
            else if (jsonElement.ValueKind == JsonValueKind.String)
            {
                AddIfValid(jsonElement.GetString());
            }
        }
        else if (raw is IEnumerable enumerable)
        {
            foreach (var item in enumerable)
            {
                AddIfValid(item?.ToString());
            }
        }

        return list.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static string NormalizeRelativePath(string path)
    {
        var p = path.Trim().Replace('\\', '/');
        // Loại bỏ ký tự slash ở đầu để đảm bảo luôn là relative path
        return p.TrimStart('/');
    }
}
