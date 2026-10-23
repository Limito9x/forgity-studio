using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.StructRegistry;

namespace Automation.Pipeline.Tools.Construct;

/// <summary>
/// Tool đóng gói dữ liệu thành Struct đa hình (Generic / Polymorphic Struct Maker).
/// </summary>
public class MakeStructTool(IEntityStructRegistry structRegistry) : IResolverTool
{
    public string Key => "MakeStruct";
    public string Label => "Make Struct";
    public string? Category => "Data / Struct";
    public bool IsPure => true;
    public bool IsDynamic => true;

    public NodeCapabilities Capabilities => new(
        CanAddPin: false,
        CanRemovePin: false,
        InspectorMode: "StructSelector",
        RuleNotes: "Constructs an entity struct from individual input field pins based on selected Struct Type.",
        ViewVariant: "Struct",
        SchemaConfigKeys: ["StructType"]
    );

    public (IReadOnlyList<PinDefinition> Inputs, IReadOnlyList<PinDefinition> Outputs) ResolvePins(
        Dictionary<string, object?>? configValues,
        IPinResolutionContext? context = null
    )
    {
        var structType = configValues?.GetValueOrDefault("StructType")?.ToString()?.Trim();
        var registry = context?.StructRegistry ?? structRegistry;

        if (!string.IsNullOrWhiteSpace(structType) && registry?.Get(structType, context?.ProjectId) is { } sDef)
        {
            var dynamicInputs = new List<PinDefinition>();

            // Chuyển đổi các output pins của Struct thành Input pins cho MakeStruct
            foreach (var pin in sDef.OutputPins)
            {
                dynamicInputs.Add(new PinDefinition
                {
                    Id = pin.Id,
                    Label = pin.Label,
                    Kind = PinKind.Data,
                    PrimitiveType = pin.PrimitiveType,
                    Cardinality = pin.Cardinality,
                    IsRequired = false,
                    DefaultValue = pin.DefaultValue,
                    StructType = pin.StructType,
                    Metadata = pin.Metadata
                });
            }

            // Input pin cấu hình StructType
            dynamicInputs.Add(new PinDefinition
            {
                Id = "StructType",
                Label = "Struct Type",
                Kind = PinKind.Data,
                PrimitiveType = PinPrimitiveType.String,
                Cardinality = PinCardinality.Single,
                IsRequired = true,
                DefaultValue = structType
            });

            var dynamicOutputs = new List<PinDefinition>
            {
                new()
                {
                    Id = "Result",
                    Label = sDef.Label,
                    Kind = PinKind.Data,
                    PrimitiveType = PinPrimitiveType.EntityRef,
                    StructType = structType,
                    Cardinality = PinCardinality.Single,
                    Metadata = structType
                }
            };

            return (dynamicInputs, dynamicOutputs);
        }

        return (Inputs, Outputs);
    }

    public IReadOnlyList<PinDefinition> Inputs =>
    [
        new()
        {
            Id = "StructType",
            Label = "Struct Type",
            Kind = PinKind.Data,
            PrimitiveType = PinPrimitiveType.String,
            Cardinality = PinCardinality.Single,
            IsRequired = true
        }
    ];

    public IReadOnlyList<PinDefinition> Outputs => [];

    public Task<Dictionary<string, object>> ExecuteAsync(
        Dictionary<string, object> inputs,
        ToolExecutionContext context
    )
    {
        var structType = inputs.TryGetValue("StructType", out var stVal) && stVal != null
            ? stVal.ToString()?.Trim()
            : "Struct";

        var packed = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        foreach (var (k, v) in inputs)
        {
            if (string.Equals(k, "StructType", StringComparison.OrdinalIgnoreCase))
                continue;

            packed[k] = v;
        }

        if (!string.IsNullOrWhiteSpace(structType))
        {
            packed["$type"] = structType;
        }

        var result = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase)
        {
            ["Result"] = packed,
            ["Struct"] = packed
        };

        return Task.FromResult(result);
    }
}
