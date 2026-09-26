using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.StructRegistry;

namespace Automation.Pipeline.Tools.Deconstruct;

/// <summary>
/// Tool phân rã cấu trúc thực thể đa hình (Generic / Polymorphic Struct Break).
/// </summary>
public class BreakStructTool(IEntityStructRegistry structRegistry) : IResolverTool
{
    public string Key => "BreakStruct";
    public string Label => "Break Struct";
    public string? Category => "Data / Struct";
    public bool IsPure => true;

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    )
    {
        var structType = configValues?.GetValueOrDefault("StructType")?.ToString() ?? "Resource";
        var registry = context?.StructRegistry ?? structRegistry;
        if (registry?.Get(structType, context?.ProjectId) is { } sDef)
        {
            return (Inputs, sDef.OutputPins);
        }

        return (Inputs, Outputs);
    }

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "Target",
            Label = "Target Entity",
            PrimitiveType = PinPrimitiveType.EntityRef,
            Cardinality = PinCardinality.Single,
            IsRequired = true,
            Metadata = """{"type": "entity-select", "properties": {"entity": "Resource"}}"""
        },
        new()
        {
            Id = "StructType",
            Label = "Struct Type",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = false,
            DefaultValue = "Resource"
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs =>
    [
        new()
        {
            Id = "FileName",
            Label = "File Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "FullPath",
            Label = "Full Path",
            PrimitiveType = PinPrimitiveType.Path,
            Cardinality = PinCardinality.Single
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var target = inputs.GetValueOrDefault("Target") ??
                     inputs.GetValueOrDefault("Target Entity") ??
                     inputs.GetValueOrDefault("target_entity") ??
                     inputs.GetValueOrDefault("TargetEntity") ??
                     inputs.GetValueOrDefault("target") ??
                     inputs.GetValueOrDefault("Entity") ??
                     inputs.GetValueOrDefault("entity") ??
                     inputs.Values.FirstOrDefault();

        if (target == null)
        {
            throw new ArgumentException("Target input is required for BreakStruct.");
        }

        var (detectedType, parsedId, isValid) = EntityRefHelper.Parse(target);

        // Priority 1: Self-describing $type from EntityRef
        // Priority 2: Inline config / input StructType
        // Priority 3: Fallback "Resource"
        var structType = !string.IsNullOrWhiteSpace(detectedType)
            ? detectedType
            : inputs.TryGetValue("StructType", out var stVal) && stVal != null
                ? stVal.ToString()?.Trim()
                : "Resource";

        if (string.IsNullOrEmpty(structType))
        {
            structType = "Resource";
        }

        var def = structRegistry.Get(structType);
        if (def == null)
        {
            throw new InvalidOperationException($"Struct Type '{structType}' not registered in EntityStructRegistry.");
        }

        var targetPayload = isValid && parsedId != Guid.Empty ? (object)parsedId : target;
        return await def.ResolveAsync(targetPayload, context);
    }
}
