using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Repository.Contracts;
using Microsoft.Extensions.Logging;
namespace Automation.Pipeline.Contracts.Tools.Workspaces;

/// <summary>
/// Tool phát hiện và đồng bộ các thay đổi file cục bộ (paths) từ Workstation hoặc Repository Runner vào Database.
/// Chấp nhận cả đường dẫn tuyệt đối (Full Physical Path trên Runner) lẫn đường dẫn tương đối (Relative Path).
/// </summary>
public class SyncLocalChangeToRepositoryTool(
    IRepositoryApi repositoryApi,
    ILogger<SyncLocalChangeToRepositoryTool>? logger = null
) : IResolverTool
{
    public string Key => "SyncLocalChangeToRepository";
    public IReadOnlyList<string> Aliases => ["SyncLocalChangeToWorkspace", "SyncLocalChanges", "SyncLocalChange"];
    public string Label => "Sync Local Change To Repository";
    public string? Category => "Workspaces & Resources";
    public string? Description => "Detects and synchronizes newly created or modified local files from a workstation/runner back into the repository database.";

    public IReadOnlyList<PinDefinition> Inputs =>
        new List<PinDefinition>
        {
            new PinDefinition
            {
                Id = "Workstation",
                Label = "Target Workstation",
                PrimitiveType = PinPrimitiveType.EntityRef,
                StructType = WellKnownStructTypes.Workstation,
                Cardinality = PinCardinality.Single,
                IsRequired = true,
                Description = "Target Workstation (Pairs Repository + Runner and provides RootPath)"
            },
            new PinDefinition
            {
                Id = "RelativePaths",
                Label = "Paths",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Array,
                IsRequired = true,
                Description = "File paths to synchronize (accepts both Full Physical Paths and POSIX Relative Paths)"
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
                StructType = WellKnownStructTypes.Resource,
                Cardinality = PinCardinality.Map,
                IsRequired = false,
                Description = "Mapping from POSIX relative path to created/updated Resource entity ref",
                SampleJson = "{\n  \"characters/hero.fbx\": {\n    \"$entity\": \"Resource\",\n    \"id\": \"00000000-0000-0000-0000-000000000000\"\n  }\n}"
            },
            new PinDefinition
            {
                Id = "FirstResource",
                Label = "First Resource",
                PrimitiveType = PinPrimitiveType.EntityRef,
                StructType = WellKnownStructTypes.Resource,
                Cardinality = PinCardinality.Single,
                IsRequired = false,
            },
            new PinDefinition
            {
                Id = "Resources",
                Label = "Resources",
                PrimitiveType = PinPrimitiveType.EntityRef,
                StructType = WellKnownStructTypes.Resource,
                Cardinality = PinCardinality.Array,
                IsRequired = false,
            },
        };

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;
        Guid? repositoryId = null;
        Guid? runnerId = null;
        string? rootPath = null;

        // 1. Resolve Workstation if provided
        var wsObj = inputs.GetValueOrDefault("Workstation") ?? inputs.GetValueOrDefault("WorkstationId");
        if (wsObj != null)
        {
            var wsId = EntityRefHelper.ExtractRefId(wsObj);
            if (wsId.HasValue && wsId.Value != Guid.Empty)
            {
                var wsResult = await repositoryApi.GetWorkstationByIdAsync(wsId.Value, ct);
                if (wsResult.IsSuccess && wsResult.Value != null)
                {
                    repositoryId = wsResult.Value.RepositoryId;
                    runnerId = wsResult.Value.RunnerId;
                    rootPath = wsResult.Value.RootPath;
                }
            }
        }

        // 2. Fallback to Target Repository
        if (!repositoryId.HasValue)
        {
            var repoObj =
                inputs.GetValueOrDefault("Repository")
                ?? inputs.GetValueOrDefault("RepositoryId")
                ?? inputs.GetValueOrDefault("TargetRepository")
                ?? inputs.GetValueOrDefault("Workspace")
                ?? inputs.GetValueOrDefault("WorkspaceId");

            repositoryId = EntityRefHelper.ExtractRefId(repoObj);
        }

        if (repositoryId == null || repositoryId == Guid.Empty)
            throw new ArgumentException("Repository ID or Workstation is required and must be a valid entity reference or GUID.");

        // 3. Fallback to Target Runner
        if (!runnerId.HasValue)
        {
            var runnerObj =
                inputs.GetValueOrDefault("Runner")
                ?? inputs.GetValueOrDefault("RunnerId")
                ?? inputs.GetValueOrDefault("TargetRunner")
                ?? inputs.GetValueOrDefault("TargetRunnerId");

            runnerId = EntityRefHelper.ExtractRefId(runnerObj);
        }

        if (runnerId == null || runnerId == Guid.Empty)
            throw new ArgumentException("Runner ID or Workstation is required and must be a valid entity reference or GUID.");

        // If rootPath not resolved from workstation, query from repositoryApi
        if (string.IsNullOrEmpty(rootPath))
        {
            var rootResult = await repositoryApi.GetRepositoryRootPathAsync(repositoryId.Value, runnerId.Value, ct);
            if (rootResult.IsSuccess)
            {
                rootPath = rootResult.Value;
            }
        }

        // 4. Resolve & Normalize Paths (accepts FullPath and RelativePath)
        var rawPaths =
            inputs.GetValueOrDefault("RelativePaths")
            ?? inputs.GetValueOrDefault("Paths")
            ?? inputs.GetValueOrDefault("TargetPaths")
            ?? inputs.GetValueOrDefault("relative_paths");

        var targetPaths = ExtractNormalizedRelativePaths(rawPaths, rootPath);

        // Guard clause: Ngăn chặn quét sạch toàn bộ workspace local lên database nếu Paths không có hoặc rỗng
        if (targetPaths.Count == 0)
        {
            logger?.LogWarning(
                "SyncLocalChangeToRepositoryTool: Paths is empty for repository {RepoId} and runner {RunnerId}. Sync skipped to prevent unintended full workspace scan.",
                repositoryId.Value,
                runnerId.Value
            );

            return new Dictionary<string, object>
            {
                ["AddedCount"] = 0,
                ["ModifiedCount"] = 0,
                ["LocationRemoved"] = 0,
                ["ResourceMap"] = new Dictionary<string, object>(),
                ["FirstResource"] = "",
                ["Resources"] = Array.Empty<object>(),
            };
        }

        var notes =
            inputs.TryGetValue("Notes", out var nObj) && nObj != null
                ? nObj.ToString()
                : "Sync from Pipeline";

        // 5. Invoke Sync qua IRepositoryApi
        var result = await repositoryApi.SyncLocalChangesAsync(
            repositoryId.Value,
            runnerId.Value,
            targetPaths,
            notes,
            ct
        );

        if (result.IsFailed)
            throw new InvalidOperationException(
                string.Join(", ", result.Errors.Select(e => e.Message))
            );

        // 6. Chuẩn hóa ResourceMap: Chỉ ánh xạ các RelativePath chuẩn -> Resource EntityRef
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

            var cleanRel = NormalizeRelativePath(k, rootPath);
            var entityRef = EntityRefHelper.Create("Resource", v);

            // Cho phép tra cứu bằng cả 2 kiểu phân cách '/' và '\'
            resourceMap[cleanRel] = entityRef;
            resourceMap[cleanRel.Replace('/', '\\')] = entityRef;
        }

        // 7. Tạo danh sách Resources và FirstResource
        var resourceList = new List<object>();
        foreach (var vId in versionIdList)
        {
            resourceList.Add(EntityRefHelper.Create("Resource", vId));
        }

        object firstResource = resourceList.Count > 0 ? resourceList[0] : "";
        if (resourceList.Count == 0 && resourceMap.Count > 0)
        {
            firstResource = resourceMap.Values.First();
            resourceList = resourceMap.Values.Distinct().ToList();
        }

        return new Dictionary<string, object>
        {
            ["AddedCount"] = result.Value.AddedCount,
            ["ModifiedCount"] = result.Value.ModifiedCount,
            ["LocationRemoved"] = result.Value.LocationRemoved,
            ["ResourceMap"] = resourceMap,
            ["FirstResource"] = firstResource,
            ["Resources"] = resourceList,
        };
    }

    private static List<string> ExtractNormalizedRelativePaths(object? raw, string? runnerRootPath = null)
    {
        var list = new List<string>();

        void AddIfValid(string? path)
        {
            if (string.IsNullOrWhiteSpace(path)) return;
            var normalized = NormalizeRelativePath(path, runnerRootPath);
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

    private static string NormalizeRelativePath(string path, string? runnerRootPath = null)
    {
        var p = path.Trim().Replace('\\', '/');

        if (!string.IsNullOrWhiteSpace(runnerRootPath))
        {
            var cleanRoot = runnerRootPath.Trim().Replace('\\', '/').TrimEnd('/');
            if (p.StartsWith(cleanRoot, StringComparison.OrdinalIgnoreCase))
            {
                p = p.Substring(cleanRoot.Length);
            }
            else if (Path.IsPathRooted(p) || (p.Length > 2 && p[1] == ':'))
            {
                try
                {
                    p = Path.GetRelativePath(cleanRoot, p).Replace('\\', '/');
                }
                catch
                {
                    // Fallback cross drive
                }
            }
        }

        // Loại bỏ ký tự slash ở đầu để đảm bảo luôn là relative path
        return p.TrimStart('/');
    }
}
