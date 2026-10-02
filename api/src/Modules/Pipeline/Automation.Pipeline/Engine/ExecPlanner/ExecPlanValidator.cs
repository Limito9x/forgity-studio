using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.Models;

namespace Automation.Pipeline.Engine.ExecPlanner;

public static class ExecPlanValidator
{
    public static List<UnresolvedPin> ValidateRequiredPins(
        List<ExecSegment> segments,
        Dictionary<string, object?>? runtimeInputs
    )
    {
        var unresolvedPins = new List<UnresolvedPin>();

        IEnumerable<ExecStep> Flatten(IEnumerable<ExecSegment> segs)
        {
            foreach (var seg in segs)
            {
                foreach (var step in seg.Steps) yield return step;
                if (seg.BodyPlan != null)
                {
                    foreach (var s in Flatten(seg.BodyPlan.Segments)) yield return s;
                }
            }
        }

        foreach (var step in Flatten(segments))
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

                var isScopeImplicit = string.Equals(pin.Id, "Item", StringComparison.OrdinalIgnoreCase) ||
                                      string.Equals(pin.Id, "Index", StringComparison.OrdinalIgnoreCase) ||
                                      string.Equals(pin.Id, "Key", StringComparison.OrdinalIgnoreCase) ||
                                      string.Equals(pin.Id, "Value", StringComparison.OrdinalIgnoreCase) ||
                                      string.Equals(pin.Id, "YieldValue", StringComparison.OrdinalIgnoreCase) ||
                                      string.Equals(pin.Id, "YieldKey", StringComparison.OrdinalIgnoreCase);

                if (!isConnected && !hasInlineValue && !hasDefaultValue && !hasRuntimeInput && !isScopeImplicit && pin.IsRequired)
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
