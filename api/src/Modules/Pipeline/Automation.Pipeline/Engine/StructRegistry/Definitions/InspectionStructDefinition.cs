using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools;
using Automation.Repository.Contracts;

namespace Automation.Pipeline.Engine.StructRegistry.Definitions;

public class InspectionStructDefinition(
    IRepositoryApi workspaceApi
) : IEntityStructDefinition
{
    public string StructType => "Inspection";
    public string Label => "Inspection";

    public IReadOnlyList<PinDefinition> OutputPins =>
    [
        new()
        {
            Id = "ResourceVersionId",
            Label = "Resource Version ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "MainObjects",
            Label = "Main Objects",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Array
        },
        new()
        {
            Id = "SkeletonBones",
            Label = "Skeleton Bones",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Array
        },
        new()
        {
            Id = "Metadata",
            Label = "Metadata JSON",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        }
    ];

    public async Task<Dictionary<string, object>> ResolveAsync(
        object targetInput,
        ToolExecutionContext context
    )
    {
        var (type, targetGuid, isValid) = EntityRefHelper.Parse(targetInput);
        if (!isValid || targetGuid == Guid.Empty)
        {
            throw new ArgumentException($"Invalid Target Inspection Reference: '{targetInput}'");
        }

        var ct = context.CancellationToken;

        var versionId = targetGuid;
        var locResult = await workspaceApi.GetResourceLocationAsync(targetGuid, ct);
        if (locResult.IsSuccess)
        {
            versionId = locResult.Value.ResourceVersionId;
        }

        var metaResult = await workspaceApi.GetMetadataAsync(versionId, ct);
        if (metaResult.IsFailed)
        {
            throw new InvalidOperationException($"No metadata found for target ID '{targetGuid}'.");
        }

        var metaDoc = metaResult.Value;

        // Extract MainObjects from Data
        var mainObjects = ExtractStringArray(metaDoc, "main_objects") ??
                          ExtractStringArray(metaDoc, "objects") ??
                          ExtractStringArray(metaDoc, "figures") ??
                          [];

        // Extract Bones from Data
        var bones = ExtractStringArray(metaDoc, "skeleton_bones") ??
                    ExtractStringArray(metaDoc, "bones") ??
                    [];

        return new Dictionary<string, object>
        {
            ["ResourceVersionId"] = EntityRefHelper.Create("ResourceVersion", versionId),
            ["MainObjects"] = mainObjects,
            ["SkeletonBones"] = bones,
            ["Metadata"] = metaDoc?.RootElement.GetRawText() ?? string.Empty
        };
    }

    private static string[]? ExtractStringArray(JsonDocument? doc, string propertyName)
    {
        if (doc == null || doc.RootElement.ValueKind != JsonValueKind.Object)
            return null;

        if (doc.RootElement.TryGetProperty(propertyName, out var element))
        {
            if (element.ValueKind == JsonValueKind.Array)
            {
                return element.EnumerateArray()
                    .Select(e => e.ValueKind switch
                    {
                        JsonValueKind.String => e.GetString(),
                        JsonValueKind.Object when e.TryGetProperty("name", out var nameProp) => nameProp.GetString(),
                        _ => e.GetRawText()
                    })
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .Select(s => s!)
                    .ToArray();
            }
            if (element.ValueKind == JsonValueKind.String)
            {
                return [element.GetString()!];
            }
        }

        return null;
    }
}
