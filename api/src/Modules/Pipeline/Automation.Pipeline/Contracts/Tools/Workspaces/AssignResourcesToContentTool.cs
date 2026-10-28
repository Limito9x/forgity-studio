using System.Collections;
using System.Text.Json;
using Automation.Content.Contracts;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Repository.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
namespace Automation.Pipeline.Contracts.Tools.Workspaces;

public class AssignResourcesToContentTool(
    IRepositoryApi workspaceApi,
    IContentApi contentApi,
    ILogger<AssignResourcesToContentTool> logger
) : IResolverTool
{
    public string Key => "AssignResourcesToContent";
    public IReadOnlyList<string> Aliases => ["AssignResources"];
    public string Label => "Assign Resources to Content";
    public string? Category => "Content & Publishing";
    public string? Description => "Binds a list of Resource items to a designated Content Item (supports finding or auto-creating by Type and Name).";
    public bool IsPure => false;
    public bool HasDynamicPins => true;

    public NodeCapabilities Capabilities => new(
        CanAddPin: false,
        CanRemovePin: false,
        InspectorMode: "Default",
        RuleNotes: "Binds resources to a Content Item either directly via ContentItem entity reference, or automatically by Type and Name.",
        ViewVariant: "Standard",
        SchemaConfigKeys: ["Mode"]
    );

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    )
    {
        var mode = configValues?.GetValueOrDefault("Mode")?.ToString()?.Trim();
        if (string.Equals(mode, "ByEntityRef", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(mode, "EntityRef", StringComparison.OrdinalIgnoreCase))
        {
            return (
                [
                    new()
                    {
                        Id = "ContentItem",
                        Label = "Content Item",
                        PrimitiveType = PinPrimitiveType.EntityRef,
                        StructType = WellKnownStructTypes.ContentItem,
                        Cardinality = PinCardinality.Single,
                        IsRequired = true,
                        Description = "Target Content Item reference to bind resources to"
                    },
                    new()
                    {
                        Id = "Resources",
                        Label = "Resources",
                        PrimitiveType = PinPrimitiveType.EntityRef,
                        StructType = WellKnownStructTypes.Resource,
                        Cardinality = PinCardinality.Array,
                        IsRequired = true,
                        Description = "Batch of Resource entity references to bind"
                    }
                ],
                Outputs
            );
        }

        // Mặc định: Mode ByName / Auto-Create
        return (
            [
                new()
                {
                    Id = "ContentType",
                    Label = "Content Type",
                    PrimitiveType = PinPrimitiveType.String,
                    Cardinality = PinCardinality.Single,
                    IsRequired = true,
                    Description = "Category/Type of the content (e.g. Character, Clothing, Hair)"
                },
                new()
                {
                    Id = "ContentName",
                    Label = "Content Name",
                    PrimitiveType = PinPrimitiveType.String,
                    Cardinality = PinCardinality.Single,
                    IsRequired = true,
                    Description = "Name of the target content item (e.g. Eva)"
                },
                new()
                {
                    Id = "CreateIfNotExists",
                    Label = "Create If Not Exists",
                    PrimitiveType = PinPrimitiveType.Boolean,
                    Cardinality = PinCardinality.Single,
                    DefaultValue = true,
                    IsRequired = false
                },
                new()
                {
                    Id = "Resources",
                    Label = "Resources",
                    PrimitiveType = PinPrimitiveType.EntityRef,
                    StructType = WellKnownStructTypes.Resource,
                    Cardinality = PinCardinality.Array,
                    IsRequired = true
                }
            ],
            Outputs
        );
    }

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "ContentType",
            Label = "Content Type",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Description = "Category/Type of the content (e.g. Character, Clothing, Hair)"
        },
        new()
        {
            Id = "ContentName",
            Label = "Content Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Description = "Name of the target content item (e.g. Eva)"
        },
        new()
        {
            Id = "CreateIfNotExists",
            Label = "Create If Not Exists",
            PrimitiveType = PinPrimitiveType.Boolean,
            Cardinality = PinCardinality.Single,
            DefaultValue = true,
            IsRequired = false
        },
        new()
        {
            Id = "Resources",
            Label = "Resources",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Resource,
            Cardinality = PinCardinality.Array,
            IsRequired = true
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "ContentId",
            Label = "Content ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.ContentItem,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "ContentName",
            Label = "Content Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "ContentType",
            Label = "Content Type",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "ResourceIds",
            Label = "Resource Ids",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Resource,
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

        // 1. Resolve Content ID (Direct or via ContentType + ContentName)
        var contentObj = inputs.GetValueOrDefault("ContentId") ??
                         inputs.GetValueOrDefault("Content") ??
                         inputs.GetValueOrDefault("Target") ??
                         inputs.GetValueOrDefault("ContentItem");

        var contentGuid = EntityRefHelper.ExtractRefId(contentObj);
        string resolvedContentName = string.Empty;
        string resolvedContentType = string.Empty;

        if (contentGuid == null || contentGuid == Guid.Empty)
        {
            // Resolve via ContentType + ContentName + CreateIfNotExists
            var ctObj = inputs.GetValueOrDefault("ContentType");
            var ctGuid = EntityRefHelper.ExtractRefId(ctObj);
            var rawContentType = (ctGuid.HasValue && ctGuid.Value != Guid.Empty)
                ? ctGuid.Value.ToString()
                : ctObj?.ToString()?.Trim();

            var rawContentName = inputs.GetValueOrDefault("ContentName")?.ToString()?.Trim();

            var createObj = inputs.GetValueOrDefault("CreateIfNotExists");
            var createIfNotExists = createObj switch
            {
                bool b => b,
                string s when bool.TryParse(s, out var pb) => pb,
                JsonElement je when je.ValueKind == JsonValueKind.True => true,
                JsonElement je when je.ValueKind == JsonValueKind.False => false,
                _ => true
            };

            if (string.IsNullOrWhiteSpace(rawContentName))
            {
                throw new ArgumentException("Either 'ContentId' or 'ContentName' (along with 'ContentType') must be provided to assign resources.");
            }

            if (string.IsNullOrWhiteSpace(rawContentType))
            {
                throw new ArgumentException("When providing 'ContentName', 'ContentType' must also be specified.");
            }

            // Resolve ProjectId
            var projectId = context.ProjectId;

            if (projectId == Guid.Empty)
            {
                var pObj = inputs.GetValueOrDefault("ProjectId");
                var parsed = EntityRefHelper.ExtractRefId(pObj);
                if (parsed.HasValue) projectId = parsed.Value;
            }

            if (projectId == Guid.Empty)
            {
                throw new InvalidOperationException("Unable to resolve ProjectId for Content assignment.");
            }

            var contentResult = await contentApi.GetOrCreateContentItemAsync(
                projectId,
                rawContentType,
                rawContentName,
                createIfNotExists,
                ct
            );

            if (contentResult.IsFailed)
            {
                var errMsg = string.Join(", ", contentResult.Errors.Select(e => e.Message));
                throw new InvalidOperationException($"Failed to resolve or create Content: {errMsg}");
            }

            contentGuid = contentResult.Value.Id;
            resolvedContentName = contentResult.Value.Name;
            resolvedContentType = contentResult.Value.ContentTypeName;
        }
        else
        {
            // If direct ContentId provided, try to fetch Content details for outputs
            var contentResult = await contentApi.GetContentByIdAsync(contentGuid.Value, ct);
            if (contentResult.IsSuccess && contentResult.Value != null)
            {
                resolvedContentName = contentResult.Value.Name;
                resolvedContentType = contentResult.Value.ContentTypeName;
            }
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
                ["ContentId"] = contentGuid.Value.ToString(),
                ["ContentName"] = resolvedContentName,
                ["ContentType"] = resolvedContentType,
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
            "Successfully assigned {Count} resources to Content {ContentId} ({ContentName})",
            resourceGuids.Count,
            contentGuid.Value,
            resolvedContentName
        );

        var outputIds = resourceGuids.Select(id => id.ToString()).ToArray();

        return new Dictionary<string, object>
        {
            ["Success"] = true,
            ["ContentId"] = contentGuid.Value.ToString(),
            ["ContentName"] = resolvedContentName,
            ["ContentType"] = resolvedContentType,
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
