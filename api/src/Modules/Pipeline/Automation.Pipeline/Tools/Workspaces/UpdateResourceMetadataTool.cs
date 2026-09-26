using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Tools.Workspaces;

public class UpdateResourceMetadataTool(IRepositoryApi workspaceApi) : IResolverTool
{
    public string Key => "UpdateResourceMetadata";
    public string Label => "Update Resource Metadata";
    public string? Category => "Workspace & Files";
    public string? Description => "Updates metadata for a single Resource / Version or a batch Map of Resource IDs -> Metadata.";
    public bool IsPure => false;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Target",
            Label = "Resource / Version",
            PrimitiveType = PinPrimitiveType.EntityRef,
            EntityTarget = "resource",
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            Metadata = """{"type": "entity-select", "properties": {"entity": "Resource"}}"""
        },
        new()
        {
            Id = "Metadata",
            Label = "Metadata JSON",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false
        },
        new()
        {
            Id = "MetadataMap",
            Label = "Metadata Map",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Map,
            IsRequired = false
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "Success",
            Label = "Success",
            PrimitiveType = PinPrimitiveType.Boolean,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        },
        new()
        {
            Id = "UpdatedCount",
            Label = "Updated Count",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        },
        new()
        {
            Id = "ResourceVersionId",
            Label = "Resource Version ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Single,
            IsRequired = false
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;

        // 1. Check Batch Mode: MetadataMap input provided
        object? rawMap = null;
        foreach (var (k, v) in inputs)
        {
            var norm = k.Replace(" ", "").Replace("_", "").Replace("-", "");
            if (string.Equals(norm, "MetadataMap", StringComparison.OrdinalIgnoreCase))
            {
                rawMap = v;
                break;
            }
        }
        rawMap ??= inputs.GetValueOrDefault("MetadataMap") ?? inputs.GetValueOrDefault("metadata_map");

        // Fallback: If no explicit single Target but any input is a dictionary / JSON object, treat as Batch Map
        if (rawMap == null && !inputs.ContainsKey("Target") && !inputs.ContainsKey("ResourceVersionId") && !inputs.ContainsKey("Resource"))
        {
            foreach (var (_, v) in inputs)
            {
                if (v is IDictionary || v is JsonElement { ValueKind: JsonValueKind.Object })
                {
                    rawMap = v;
                    break;
                }
            }
        }

        var metadataMap = ExtractMap(rawMap);

        if (metadataMap.Count > 0)
        {
            var updatedCount = 0;
            foreach (var (resourceKey, metaVal) in metadataMap)
            {
                var targetGuid = EntityRefHelper.ExtractRefId(resourceKey);
                if (targetGuid == null || targetGuid == Guid.Empty)
                {
                    var cleanKey = resourceKey.Trim();
                    var lastColon = cleanKey.LastIndexOf(':');
                    var candidate = lastColon >= 0 ? cleanKey[(lastColon + 1)..].Trim() : cleanKey;
                    if (Guid.TryParse(candidate, out var parsedGuid) && parsedGuid != Guid.Empty)
                    {
                        targetGuid = parsedGuid;
                    }
                }

                if (targetGuid == null || targetGuid == Guid.Empty)
                {
                    throw new ArgumentException(
                        $"Invalid Resource Reference in MetadataMap key '{resourceKey}'. Expected a valid GUID or EntityRef (e.g. 'urn:resource:...').");
                }

                var versionId = targetGuid.Value;
                var locResult = await workspaceApi.GetResourceLocationAsync(targetGuid.Value, ct);
                if (locResult.IsSuccess)
                {
                    versionId = locResult.Value.ResourceVersionId;
                }

                var jsonDoc = ParseToJsonDocument(metaVal, resourceKey);

                var updateResult = await workspaceApi.UpdateMetadataAsync(versionId, jsonDoc, ct);
                if (updateResult.IsFailed)
                {
                    throw new InvalidOperationException(
                        $"Failed to update metadata for ResourceVersion '{versionId}': {string.Join(", ", updateResult.Errors.Select(e => e.Message))}");
                }

                updatedCount++;
            }

            return new Dictionary<string, object>
            {
                ["Success"] = true,
                ["UpdatedCount"] = updatedCount
            };
        }

        // 2. Fallback to Single Update Mode
        var targetObj = inputs.GetValueOrDefault("Target") ??
                        inputs.GetValueOrDefault("ResourceVersionId") ??
                        inputs.GetValueOrDefault("Resource");

        var metaObj = inputs.GetValueOrDefault("Metadata") ??
                      inputs.GetValueOrDefault("metadata") ??
                      inputs.GetValueOrDefault("metadata_json") ??
                      inputs.GetValueOrDefault("MetadataJson") ??
                      inputs.GetValueOrDefault("Data");

        var singleTargetGuid = EntityRefHelper.ExtractRefId(targetObj);
        if (singleTargetGuid == null || singleTargetGuid == Guid.Empty)
        {
            var rawStr = targetObj?.ToString();
            var detail = string.IsNullOrWhiteSpace(rawStr)
                ? "Target Reference is empty. Please provide a valid Resource / Version ID or connect a 'MetadataMap'."
                : $"Invalid Target Reference: '{targetObj}'";
            throw new ArgumentException(detail);
        }

        if (metaObj == null)
        {
            throw new ArgumentException("Metadata JSON is required in single update mode.");
        }

        var singleVersionId = singleTargetGuid.Value;
        var singleLocResult = await workspaceApi.GetResourceLocationAsync(singleTargetGuid.Value, ct);
        if (singleLocResult.IsSuccess)
        {
            singleVersionId = singleLocResult.Value.ResourceVersionId;
        }

        var singleJsonDoc = ParseToJsonDocument(metaObj, targetObj?.ToString() ?? "Target");

        var singleUpdateResult = await workspaceApi.UpdateMetadataAsync(singleVersionId, singleJsonDoc, ct);
        if (singleUpdateResult.IsFailed)
        {
            throw new InvalidOperationException(
                $"Failed to update metadata for ResourceVersion '{singleVersionId}': {string.Join(", ", singleUpdateResult.Errors.Select(e => e.Message))}");
        }

        return new Dictionary<string, object>
        {
            ["Success"] = true,
            ["UpdatedCount"] = 1,
            ["ResourceVersionId"] = EntityRefHelper.Create("ResourceVersion", singleVersionId)
        };
    }

    private static Dictionary<string, object?> ExtractMap(object? source)
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        if (source == null) return result;

        if (source is IDictionary dict)
        {
            foreach (DictionaryEntry entry in dict)
            {
                if (entry.Key != null)
                {
                    result[entry.Key.ToString()!] = entry.Value;
                }
            }
            return result;
        }

        if (source is JsonElement jsonElem && jsonElem.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in jsonElem.EnumerateObject())
            {
                result[prop.Name] = prop.Value.ValueKind switch
                {
                    JsonValueKind.String => prop.Value.GetString(),
                    JsonValueKind.Number => prop.Value.TryGetInt64(out var l) ? l : prop.Value.GetDouble(),
                    JsonValueKind.True => true,
                    JsonValueKind.False => false,
                    JsonValueKind.Null => null,
                    _ => prop.Value.Clone()
                };
            }
            return result;
        }

        if (source is string jsonStr && jsonStr.TrimStart().StartsWith('{'))
        {
            try
            {
                using var doc = JsonDocument.Parse(jsonStr);
                if (doc.RootElement.ValueKind == JsonValueKind.Object)
                {
                    return ExtractMap(doc.RootElement);
                }
            }
            catch
            {
                // Fallback: empty map
            }
        }

        return result;
    }

    private static JsonDocument ParseToJsonDocument(object? metaObj, string contextKey)
    {
        if (metaObj is JsonDocument doc)
        {
            return doc;
        }

        if (metaObj is JsonElement elem)
        {
            if (elem.ValueKind == JsonValueKind.String)
            {
                var strVal = elem.GetString();
                if (string.IsNullOrWhiteSpace(strVal))
                {
                    throw new ArgumentException(
                        $"Metadata for '{contextKey}' is empty. Upstream node may have returned null or empty string.");
                }
                try
                {
                    return JsonDocument.Parse(strVal);
                }
                catch (JsonException ex)
                {
                    throw new ArgumentException($"Failed to parse Metadata JSON string '{strVal}' for '{contextKey}': {ex.Message}");
                }
            }

            return JsonDocument.Parse(elem.GetRawText());
        }

        if (metaObj is string rawStr)
        {
            if (string.IsNullOrWhiteSpace(rawStr))
            {
                throw new ArgumentException(
                    $"Metadata for '{contextKey}' is empty. Upstream node may have returned null or empty string.");
            }

            try
            {
                return JsonDocument.Parse(rawStr);
            }
            catch (JsonException ex)
            {
                throw new ArgumentException($"Failed to parse Metadata JSON string '{rawStr}' for '{contextKey}': {ex.Message}");
            }
        }

        try
        {
            var json = JsonSerializer.Serialize(metaObj);
            return JsonDocument.Parse(json);
        }
        catch (Exception ex)
        {
            throw new ArgumentException(
                $"Failed to serialize metadata object of type '{metaObj?.GetType().Name}' for '{contextKey}' to JSON: {ex.Message}");
        }
    }
}
