using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Runtime.Planner.Models;
namespace Automation.Pipeline.Contracts.Validation;

public static class ExecPlanValidator
{
    public static List<UnresolvedPin> ValidateRequiredPins(
        List<ExecSegment> segments,
        Dictionary<string, object?>? runtimeInputs
    )
    {
        var unresolvedPins = new List<UnresolvedPin>();

        foreach (var step in segments.SelectMany(s => s.Steps))
        {
            foreach (var pin in step.InputPins)
            {
                if (pin.Kind == PinKind.Exec || string.Equals(pin.Id, "exec_in", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                var isConnected = step.IncomingConnections.Any(c =>
                    string.Equals(c.TargetPinKey, pin.Id, StringComparison.OrdinalIgnoreCase) ||
                    string.Equals(c.TargetPinKey, pin.Label, StringComparison.OrdinalIgnoreCase));

                var hasInlineValue = HasConfigValue(step.Config, pin.Id) || HasConfigValue(step.Config, pin.Label);
                var hasDefaultValue = pin.DefaultValue != null;
                var hasRuntimeInput = runtimeInputs != null &&
                    (runtimeInputs.ContainsKey(pin.Id) ||
                     runtimeInputs.ContainsKey(pin.Label) ||
                     runtimeInputs.ContainsKey($"{step.NodeId}:{pin.Id}"));

                if (!isConnected && !hasInlineValue && !hasDefaultValue && !hasRuntimeInput && pin.IsRequired)
                {
                    unresolvedPins.Add(new UnresolvedPin(
                        step.NodeId,
                        step.Label,
                        pin.Id,
                        pin.Label,
                        pin.PrimitiveType,
                        "Required input pin is not connected and has no inline or default value."
                    ));
                }
            }
        }

        return unresolvedPins;
    }

    private static bool HasConfigValue(JsonDocument? config, string key)
    {
        if (config == null || string.IsNullOrWhiteSpace(key)) return false;

        if (config.RootElement.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in config.RootElement.EnumerateObject())
            {
                if (string.Equals(prop.Name, key, StringComparison.OrdinalIgnoreCase))
                {
                    return prop.Value.ValueKind switch
                    {
                        JsonValueKind.Null or JsonValueKind.Undefined => false,
                        JsonValueKind.String => !string.IsNullOrEmpty(prop.Value.GetString()),
                        JsonValueKind.Array => prop.Value.GetArrayLength() > 0,
                        _ => true
                    };
                }
            }
        }

        return false;
    }
}
