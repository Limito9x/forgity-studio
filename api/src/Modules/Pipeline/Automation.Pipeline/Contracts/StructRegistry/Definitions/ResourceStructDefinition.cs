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
    IContentApi? contentApi = null,
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
                if (!string.IsNullOrEmpty(rPath))
                {
                    var fName = Path.GetFileName(rPath);
                    res["FileName"] = fName;
                    res["BaseName"] = Path.GetFileNameWithoutExtension(fName);
                    res["Extension"] = Path.GetExtension(fName);
                    res["DirectoryPath"] = Path.GetDirectoryName(rPath)?.Replace('\\', '/') ?? string.Empty;
                }
                return res;
            }
        }

        // 1. Resolve Target Resource ID (hỗ trợ cả ResourceVersionId lẫn ResourceId gốc)
        var (type, targetId, isValid) = EntityRefHelper.Parse(targetInput);
        if (!isValid || targetId == Guid.Empty)
        {
            throw new ArgumentException($"Cannot resolve Resource struct from input: {targetInput}");
        }

        var ct = context.CancellationToken;

        // Try getting from execution state store first (O(1) in-memory)
        var cachedProps = entityStore?.GetProperties("Resource", targetId);
        if (cachedProps != null)
        {
            var inMemoryResult = new Dictionary<string, object>(cachedProps.Where(kvp => kvp.Value != null)!);
            return inMemoryResult;
        }

        // 2. Query Repository API for physical location and version info
        var locationResult = await workspaceApi.GetResourceLocationAsync(targetId, ct);
        if (locationResult.IsFailed || locationResult.Value == null)
        {
            throw new InvalidOperationException(
                $"Failed to resolve physical location for Resource '{targetId}': " +
                string.Join(", ", locationResult.Errors.Select(e => e.Message))
            );
        }

        var locationInfo = locationResult.Value;
        var relPath = locationInfo.RelativePath?.Replace('\\', '/') ?? string.Empty;
        var fileName = Path.GetFileName(relPath);
        var baseName = Path.GetFileNameWithoutExtension(fileName);
        var extension = Path.GetExtension(fileName);
        var dirPath = Path.GetDirectoryName(relPath)?.Replace('\\', '/') ?? string.Empty;

        // Full path on runner if available
        var fullPath = string.Empty;
        if (!string.IsNullOrEmpty(locationInfo.RunnerRootPath) && !string.IsNullOrEmpty(relPath))
        {
            fullPath = Path.Combine(locationInfo.RunnerRootPath, relPath).Replace('\\', '/');
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
            ["Metadata"] = metadataJson,
        };
    }
}
