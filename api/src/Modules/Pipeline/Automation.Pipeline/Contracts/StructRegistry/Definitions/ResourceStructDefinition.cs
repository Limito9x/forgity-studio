using Automation.Content.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Runtime.State.EntityStore;
using Automation.Pipeline.Contracts.Tools;
using Automation.Repository.Contracts;
namespace Automation.Pipeline.Contracts.StructRegistry.Definitions;

public class ResourceStructDefinition(
    IRepositoryApi workspaceApi,
    IContentApi contentApi,
    IExecutionEntityStore? entityStore = null
) : IEntityStructDefinition
{
    public string StructType => WellKnownStructTypes.Resource;
    public string Label => "Resource";

    public object? SampleJson => new Dictionary<string, object?>
    {
        ["ResourceId"] = "00000000-0000-0000-0000-000000000001",
        ["FileName"] = "character_model.fbx",
        ["BaseName"] = "character_model",
        ["Extension"] = ".fbx",
        ["RelativePath"] = "Characters/character_model.fbx",
        ["FullPath"] = "D:/Project/Assets/Characters/character_model.fbx",
        ["DirectoryPath"] = "D:/Project/Assets/Characters",
        ["MountPath"] = "D:/Project/Assets",
        ["HoldingRunnerId"] = "00000000-0000-0000-0000-000000000005",
        ["RepositoryId"] = "00000000-0000-0000-0000-000000000003",
        ["FileHash"] = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        ["ContentId"] = "00000000-0000-0000-0000-000000000004",
        ["ContentName"] = "Character Model",
        ["ContentType"] = "3DModel",
        ["Metadata"] = "{\"vertexCount\": 12500, \"rigged\": true}"
    };

    public IReadOnlyList<PinDefinition> OutputPins =>
        [
            new()
            {
                Id = "ResourceId",
                Label = "Resource ID",
                PrimitiveType = PinPrimitiveType.EntityRef,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "FileName",
                Label = "File Name",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "BaseName",
                Label = "Base Name",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "Extension",
                Label = "Extension",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "RepositoryId",
                Label = "Repository ID",
                PrimitiveType = PinPrimitiveType.EntityRef,
                StructType = WellKnownStructTypes.Repository,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "RelativePath",
                Label = "Relative Path",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "FullPath",
                Label = "Full Path",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "DirectoryPath",
                Label = "Directory Path",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "MountPath",
                Label = "Mount Path",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "HoldingRunnerId",
                Label = "Holding Runner ID",
                PrimitiveType = PinPrimitiveType.EntityRef,
                StructType = WellKnownStructTypes.Runner,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "FileHash",
                Label = "File Hash",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "ContentId",
                Label = "Content ID",
                PrimitiveType = PinPrimitiveType.EntityRef,
                StructType = WellKnownStructTypes.ContentItem,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "ContentName",
                Label = "Content Name",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "ContentType",
                Label = "Content Type",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
            new()
            {
                Id = "Metadata",
                Label = "Metadata JSON",
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
            },
        ];

    public async Task<Dictionary<string, object>> ResolveAsync(
        object targetInput,
        ToolExecutionContext context
    )
    {
        // 0. Support in-memory pass-through if targetInput already contains dictionary
        if (targetInput is System.Collections.IDictionary inMemoryDict)
        {
            var res = new Dictionary<string, object>();
            foreach (var key in inMemoryDict.Keys)
            {
                if (key != null)
                {
                    res[key.ToString()!] = inMemoryDict[key] ?? string.Empty;
                }
            }

            if (res.ContainsKey("RelativePath") || res.ContainsKey("FileName"))
            {
                var rPath = res.GetValueOrDefault("RelativePath")?.ToString() ?? string.Empty;
                if (
                    !res.ContainsKey("FileName")
                    || string.IsNullOrEmpty(res["FileName"]?.ToString())
                )
                    res["FileName"] = Path.GetFileName(rPath);
                if (
                    !res.ContainsKey("BaseName")
                    || string.IsNullOrEmpty(res["BaseName"]?.ToString())
                )
                    res["BaseName"] = Path.GetFileNameWithoutExtension(rPath);
                if (
                    !res.ContainsKey("Extension")
                    || string.IsNullOrEmpty(res["Extension"]?.ToString())
                )
                    res["Extension"] = Path.GetExtension(rPath).TrimStart('.').ToLowerInvariant();
                if (
                    !res.ContainsKey("DirectoryPath")
                    || string.IsNullOrEmpty(res["DirectoryPath"]?.ToString())
                )
                    res["DirectoryPath"] =
                        Path.GetDirectoryName(res["FullPath"]?.ToString() ?? rPath)
                            ?.Replace('\\', '/')
                        ?? string.Empty;

                return res;
            }
        }

        var (type, targetId, isValid) = EntityRefHelper.Parse(targetInput);
        if (!isValid || targetId == Guid.Empty)
        {
            throw new ArgumentException($"Invalid Target Resource Reference: '{targetInput}'");
        }

        // Priority 1: Check ExecutionEntityStore (Pure In-Memory lookup in 0ms)
        if (entityStore?.GetProperties("Resource", targetId) is { } cachedProps)
        {
            var inMemoryResult = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
            foreach (var (k, v) in cachedProps)
            {
                if (v != null) inMemoryResult[k] = v;
            }

            var hasContentName = inMemoryResult.TryGetValue("ContentName", out var cn) && !string.IsNullOrWhiteSpace(cn?.ToString());
            var hasContentType = inMemoryResult.TryGetValue("ContentType", out var ctProp) && !string.IsNullOrWhiteSpace(ctProp?.ToString());

            var contentIdStr = inMemoryResult.GetValueOrDefault("ContentId")?.ToString();
            if (contentApi != null && Guid.TryParse(contentIdStr, out var cId) && cId != Guid.Empty && (!hasContentName || !hasContentType))
            {
                var contentResult = await contentApi.GetContentByIdAsync(cId, context.CancellationToken);
                if (contentResult?.IsSuccess == true && contentResult.Value != null)
                {
                    inMemoryResult["ContentName"] = contentResult.Value.Name;
                    inMemoryResult["ContentType"] = contentResult.Value.ContentTypeName ?? string.Empty;
                    cachedProps["ContentName"] = contentResult.Value.Name;
                    cachedProps["ContentType"] = contentResult.Value.ContentTypeName ?? string.Empty;
                }
            }

            if (!inMemoryResult.ContainsKey("ContentName") || string.IsNullOrWhiteSpace(inMemoryResult["ContentName"]?.ToString()))
            {
                var fallbackBaseName = inMemoryResult.GetValueOrDefault("BaseName")?.ToString() ?? string.Empty;
                inMemoryResult["ContentName"] = fallbackBaseName;
            }

            return inMemoryResult;
        }

        var ct = context.CancellationToken;

        // 1. Fallback: Resolve resource location from DB if not pre-fetched
        var singleResult = await workspaceApi.GetResourceLocationAsync(targetId, ct);
        if (!singleResult.IsSuccess || singleResult.Value == null)
        {
            var errMsg = string.Join(", ", singleResult.Errors.Select(e => e.Message));
            throw new InvalidOperationException(
                $"Failed to resolve Resource '{targetId}': {errMsg}"
            );
        }

        var locationInfo = singleResult.Value;

        var relPath = locationInfo.RelativePath ?? string.Empty;
        var fullPath = locationInfo.FullLocalPath ?? relPath;
        var fileName = Path.GetFileName(relPath);
        var baseName = Path.GetFileNameWithoutExtension(relPath);
        var extension = Path.GetExtension(relPath).TrimStart('.').ToLowerInvariant();
        var dirPath = Path.GetDirectoryName(fullPath)?.Replace('\\', '/') ?? string.Empty;

        // 2. Resolve Content Info (with smart fallback to BaseName if no Content assigned)
        var contentId = locationInfo.ContentId;
        var contentName = baseName; // Smart fallback: e.g. "Eva" from "Eva.duf"
        var contentType = string.Empty;

        if (contentId.HasValue && contentId.Value != Guid.Empty)
        {
            var contentResult = await contentApi.GetContentByIdAsync(contentId.Value, ct);
            if (contentResult.IsSuccess && contentResult.Value != null)
            {
                contentName = contentResult.Value.Name;
                contentType = contentResult.Value.ContentTypeName ?? string.Empty;
            }
        }

        // 3. Resolve Metadata JSON (graceful fallback if unavailable)
        string metadataJson = string.Empty;
        try
        {
            var metaResult = await workspaceApi.GetMetadataAsync(
                locationInfo.ResourceVersionId,
                ct
            );
            if (metaResult?.IsSuccess == true && metaResult.Value != null)
            {
                metadataJson = metaResult.Value.RootElement.GetRawText();
            }
        }
        catch
        {
            // Metadata không bắt buộc - fallback về empty string
        }

        return new Dictionary<string, object>
        {
            ["ResourceId"] = locationInfo.ResourceId,
            ["ResourceVersionId"] = locationInfo.ResourceVersionId,
            ["RepositoryId"] = locationInfo.RepositoryId,
            ["Repository"] = locationInfo.RepositoryId,
            ["FileName"] = fileName,
            ["BaseName"] = baseName,
            ["Extension"] = extension,
            ["RelativePath"] = relPath,
            ["FullPath"] = fullPath,
            ["DirectoryPath"] = dirPath,
            ["MountPath"] = locationInfo.MountPath ?? string.Empty,
            ["HoldingRunnerId"] = locationInfo.RunnerId?.ToString() ?? string.Empty,
            ["RunnerId"] = locationInfo.RunnerId?.ToString() ?? string.Empty,
            ["FileHash"] = locationInfo.FileHash ?? string.Empty,
            ["ContentId"] = contentId.HasValue ? contentId.Value.ToString() : string.Empty,
            ["ContentName"] = contentName,
            ["ContentType"] = contentType,
            ["Metadata"] = metadataJson,
        };
    }
}
