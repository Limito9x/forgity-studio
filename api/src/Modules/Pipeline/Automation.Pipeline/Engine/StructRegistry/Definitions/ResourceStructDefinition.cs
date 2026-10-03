using Automation.Content.Contracts;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.EntityStore;
using Automation.Pipeline.Tools;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Engine.StructRegistry.Definitions;

public class ResourceStructDefinition(
    IRepositoryApi workspaceApi,
    IContentApi contentApi,
    IExecutionEntityStore? entityStore = null
) : IEntityStructDefinition
{
    public string StructType => "Resource";
    public string Label => "Resource";

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
                Id = "ResourceVersionId",
                Label = "Resource Version ID",
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
                Id = "DirectoryPath",
                Label = "Directory Path",
                PrimitiveType = PinPrimitiveType.Path,
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
            ["FileName"] = fileName,
            ["BaseName"] = baseName,
            ["Extension"] = extension,
            ["DirectoryPath"] = dirPath,
            ["RelativePath"] = relPath,
            ["FullPath"] = fullPath,
            ["FileHash"] = locationInfo.FileHash ?? string.Empty,
            ["ContentId"] = contentId.HasValue ? contentId.Value.ToString() : string.Empty,
            ["ContentName"] = contentName,
            ["ContentType"] = contentType,
            ["Metadata"] = metadataJson,
        };
    }
}
