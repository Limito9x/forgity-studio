using System.Collections;
using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Repository.Contracts;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Tools.Workspaces;

public class AssignResourcesToContentTool(
    IRepositoryApi workspaceApi,
    ILogger<AssignResourcesToContentTool> logger
) : IResolverTool
{
    public string Key => "AssignResourcesToContent";
    public IReadOnlyList<string> Aliases => ["AssignResources"];
    public string Label => "Assign Resources to Content";
    public string? Category => "Workspace & Content";
    public bool IsPure => false;

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "ContentId",
            Label = "Content",
            PrimitiveType = PinPrimitiveType.EntityRef,
            EntityTarget = "content",
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Metadata = """{"type": "entity-select", "properties": {"entity": "ContentItem"}}"""
        },
        new()
        {
            Id = "Resources",
            Label = "Resources",
            PrimitiveType = PinPrimitiveType.EntityRef,
            EntityTarget = "resource",
            Cardinality = PinCardinality.Array,
            IsRequired = true
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "ResourceIds",
            Label = "Resource Ids",
            PrimitiveType = PinPrimitiveType.EntityRef,
            EntityTarget = "resource",
            Cardinality = PinCardinality.Array
        },
        new()
        {
            Id = "AssignedCount",
            Label = "Assigned Count",
            PrimitiveType = PinPrimitiveType.Number,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "Success",
            Label = "Success",
            PrimitiveType = PinPrimitiveType.Boolean,
            Cardinality = PinCardinality.Single
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var ct = context.CancellationToken;

        // 1. Resolve Content ID
        var contentObj = inputs.GetValueOrDefault("ContentId") ??
                         inputs.GetValueOrDefault("Content") ??
                         inputs.GetValueOrDefault("Target") ??
                         inputs.GetValueOrDefault("ContentItem");

        var contentGuid = EntityRefHelper.ExtractRefId(contentObj);
        if (contentGuid == null || contentGuid == Guid.Empty)
        {
            throw new ArgumentException($"Content ID is required and must be a valid GUID or EntityRef. Received: '{contentObj}'");
        }

        // 2. Resolve Resources
        var resourcesObj = inputs.GetValueOrDefault("Resources") ??
                           inputs.GetValueOrDefault("ResourceIds") ??
                           inputs.GetValueOrDefault("Resource");

        var resourceGuids = ExtractResourceGuids(resourcesObj);

        if (resourceGuids.Count == 0)
        {
            logger.LogWarning(
                "AssignResourcesToContentTool: No valid Resource IDs provided to assign to Content {ContentId}",
                contentGuid.Value
            );

            return new Dictionary<string, object>
            {
                ["Success"] = true,
                ["AssignedCount"] = 0,
                ["ResourceIds"] = Array.Empty<string>()
            };
        }

        // 3. Assign via RepositoryApi
        var assignResult = await workspaceApi.AssignResourceToContentAsync(
            contentGuid.Value,
            resourceGuids,
            ct
        );

        if (assignResult.IsFailed)
        {
            var errorMsg = string.Join(", ", assignResult.Errors.Select(e => e.Message));
            logger.LogError(
                "Failed to assign {Count} resources to Content {ContentId}: {Error}",
                resourceGuids.Count,
                contentGuid.Value,
                errorMsg
            );
            throw new InvalidOperationException(
                $"Failed to assign resources to Content '{contentGuid.Value}': {errorMsg}"
            );
        }

        logger.LogInformation(
            "Successfully assigned {Count} resources to Content {ContentId}",
            resourceGuids.Count,
            contentGuid.Value
        );

        var outputIds = resourceGuids.Select(id => id.ToString()).ToArray();

        return new Dictionary<string, object>
        {
            ["Success"] = true,
            ["AssignedCount"] = resourceGuids.Count,
            ["ResourceIds"] = outputIds
        };
    }

    private static List<Guid> ExtractResourceGuids(object? input)
    {
        var result = new List<Guid>();
        if (input == null) return result;

        if (input is Guid directGuid && directGuid != Guid.Empty)
        {
            result.Add(directGuid);
            return result;
        }

        if (input is JsonElement jsonElem)
        {
            if (jsonElem.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in jsonElem.EnumerateArray())
                {
                    var guid = EntityRefHelper.ExtractRefId(item);
                    if (guid != null && guid != Guid.Empty)
                        result.Add(guid.Value);
                }
                return result.Distinct().ToList();
            }

            if (jsonElem.ValueKind == JsonValueKind.Object)
            {
                var guid = EntityRefHelper.ExtractRefId(jsonElem);
                if (guid != null && guid != Guid.Empty)
                {
                    result.Add(guid.Value);
                    return result;
                }

                // If dictionary / map
                foreach (var prop in jsonElem.EnumerateObject())
                {
                    var propGuid = EntityRefHelper.ExtractRefId(prop.Value);
                    if (propGuid != null && propGuid != Guid.Empty)
                        result.Add(propGuid.Value);
                }
                return result.Distinct().ToList();
            }

            var single = EntityRefHelper.ExtractRefId(jsonElem);
            if (single != null && single != Guid.Empty)
                result.Add(single.Value);
            return result;
        }

        if (input is IDictionary dict)
        {
            foreach (var val in dict.Values)
            {
                var guid = EntityRefHelper.ExtractRefId(val);
                if (guid != null && guid != Guid.Empty)
                    result.Add(guid.Value);
            }
            return result.Distinct().ToList();
        }

        if (input is IEnumerable enumerable and not string)
        {
            foreach (var item in enumerable)
            {
                var guid = EntityRefHelper.ExtractRefId(item);
                if (guid != null && guid != Guid.Empty)
                    result.Add(guid.Value);
            }
            return result.Distinct().ToList();
        }

        if (input is string str)
        {
            var trimmed = str.Trim();
            if (trimmed.Contains(','))
            {
                var parts = trimmed.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                foreach (var p in parts)
                {
                    var guid = EntityRefHelper.ExtractRefId(p);
                    if (guid != null && guid != Guid.Empty)
                        result.Add(guid.Value);
                }
                return result.Distinct().ToList();
            }

            var singleGuid = EntityRefHelper.ExtractRefId(trimmed);
            if (singleGuid != null && singleGuid != Guid.Empty)
                result.Add(singleGuid.Value);
            return result;
        }

        var fallbackGuid = EntityRefHelper.ExtractRefId(input);
        if (fallbackGuid != null && fallbackGuid != Guid.Empty)
            result.Add(fallbackGuid.Value);

        return result.Distinct().ToList();
    }
}
