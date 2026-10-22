using Automation.Pipeline.Constants;
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
    public string? Description => "Deconstructs a structured entity (Resource, Version, TaggedAsset, etc.) into its individual property pins.";
    public bool IsPure => true;
    public bool IsDynamic => true;

    public NodeCapabilities Capabilities => new(
        CanAddPin: false,
        CanRemovePin: false,
        InspectorMode: "StructSelector",
        RuleNotes: "Deconstructs an entity struct into individual output field pins based on selected Struct Type.",
        ViewVariant: "Struct"
    );

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    )
    {
        var structType = configValues?.GetValueOrDefault("StructType")?.ToString() ?? "Resource";
        var registry = context?.StructRegistry ?? structRegistry;
        if (registry?.Get(structType, context?.ProjectId) is { } sDef)
        {
            var resolvedInputs = new List<PinDefinition>
            {
                new()
                {
                    Id = "Target",
                    Label = $"Target ({structType})",
                    PrimitiveType = PinPrimitiveType.EntityRef,
                    StructType = structType,
                    Cardinality = PinCardinality.Single,
                    IsRequired = true
                },
                Inputs[1]
            };
            return (resolvedInputs, sDef.OutputPins);
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
            StructType = "Resource",
            Cardinality = PinCardinality.Single,
            IsRequired = true
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
            Id = "BaseName",
            Label = "Base Name",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "Extension",
            Label = "Extension",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "RelativePath",
            Label = "Relative Path",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "FullPath",
            Label = "Full Path",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "DirectoryPath",
            Label = "Directory Path",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "MountPath",
            Label = "Mount Path",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "HoldingRunnerId",
            Label = "Holding Runner ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Runner,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "RepositoryId",
            Label = "Repository ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.Repository,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "FileHash",
            Label = "File Hash",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        },
        new()
        {
            Id = "ContentId",
            Label = "Content ID",
            PrimitiveType = PinPrimitiveType.EntityRef,
            StructType = WellKnownStructTypes.ContentType,
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
            Id = "Metadata",
            Label = "Metadata JSON",
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single
        }
    ];

    public async Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var target = inputs.GetValueOrDefault("Target")
            ?? (inputs.TryGetValue("target", out var tLower) ? tLower : null);

        if (target == null)
        {
            throw new ArgumentException("Target input is required for BreakStruct.");
        }

        var (detectedType, parsedId, isValid) = EntityRefHelper.Parse(target);

        // Priority 1: Self-describing $type from EntityRef
        // Priority 2: Inline config / input StructType
        // Priority 3: Fallback WellKnownStructTypes.Resource
        var structType = !string.IsNullOrWhiteSpace(detectedType)
            ? detectedType
            : inputs.TryGetValue("StructType", out var stVal) && stVal != null
                ? stVal.ToString()?.Trim()
                : WellKnownStructTypes.Resource;

        if (string.IsNullOrEmpty(structType))
        {
            structType = WellKnownStructTypes.Resource;
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

