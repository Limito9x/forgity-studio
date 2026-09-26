using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Tools.Attributes;

namespace Automation.Pipeline.Tools.Collections;

public class RemapKeysInputs
{
    [ToolPin(Id = "DataMap", Label = "Data Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map, IsRequired = true)]
    public Dictionary<string, object?> DataMap { get; set; } = [];

    [ToolPin(Id = "KeyMap", Label = "Key Mapping", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map, IsRequired = true)]
    public Dictionary<string, object?> KeyMap { get; set; } = [];

    [ToolPin(Id = "KeepUnmatched", Label = "Keep Unmatched", PrimitiveType = PinPrimitiveType.Boolean, Cardinality = PinCardinality.Single, IsRequired = false, DefaultValue = "false")]
    public bool KeepUnmatched { get; set; }
}

public class RemapKeysOutputs
{
    [ToolPin(Id = "ResultMap", Label = "Result Map", PrimitiveType = PinPrimitiveType.String, Cardinality = PinCardinality.Map)]
    public Dictionary<string, object?> ResultMap { get; set; } = [];
}

public class RemapKeysTool : BaseResolverTool<RemapKeysInputs, RemapKeysOutputs>
{
    public override string Key => "RemapKeys";
    public override string Label => "Remap Keys";
    public override string? Category => "Collections";
    public override string? Description => "Translates the keys of a Data Map using a Key Translation Map (DataMap[OldKey] -> ResultMap[NewKey]).";
    public override bool IsPure => true;

    protected override Task<RemapKeysOutputs> ExecuteCoreAsync(RemapKeysInputs input, ToolExecutionContext context)
    {
        var resultMap = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);

        foreach (var (oldKey, value) in input.DataMap)
        {
            if (input.KeyMap.TryGetValue(oldKey, out var newKeyObj) && newKeyObj != null)
            {
                var newKey = ExtractKeyString(newKeyObj);
                if (!string.IsNullOrWhiteSpace(newKey))
                {
                    resultMap[newKey] = value;
                }
            }
            else if (input.KeepUnmatched)
            {
                resultMap[oldKey] = value;
            }
        }

        return Task.FromResult(new RemapKeysOutputs
        {
            ResultMap = resultMap
        });
    }

    private static string? ExtractKeyString(object? obj)
    {
        if (obj == null) return null;
        if (obj is string s) return s;
        if (obj is JsonElement je && je.ValueKind == JsonValueKind.String) return je.GetString();

        var refGuid = EntityRefHelper.ExtractRefId(obj);
        return refGuid != null && refGuid != Guid.Empty ? refGuid.Value.ToString() : obj.ToString();
    }
}
