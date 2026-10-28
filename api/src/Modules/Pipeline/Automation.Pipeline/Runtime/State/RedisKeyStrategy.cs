using Automation.Pipeline.Runtime.Planner.Models;
namespace Automation.Pipeline.Runtime.State;

public static class RedisKeyStrategy
{
    public static string GetNodePinKey(Guid executionId, Guid nodeId, string pinKey, ScopeContext? scope = null)
    {
        var normalizedPin = NormalizePinKey(pinKey);
        var scopePath = scope?.GetScopePath();

        if (string.IsNullOrEmpty(scopePath))
        {
            return $"pe:{executionId}:node:{nodeId}:pin:{normalizedPin}";
        }

        return $"pe:{executionId}:{scopePath}:node:{nodeId}:pin:{normalizedPin}";
    }

    public static string GetNodeStatusKey(Guid executionId, Guid nodeId, ScopeContext? scope = null)
    {
        var scopePath = scope?.GetScopePath();

        if (string.IsNullOrEmpty(scopePath))
        {
            return $"pe:{executionId}:node:{nodeId}:status";
        }

        return $"pe:{executionId}:{scopePath}:node:{nodeId}:status";
    }

    public static string GetStartInputKey(Guid executionId, string inputKey)
    {
        return $"pe:{executionId}:start:{inputKey.Trim()}";
    }

    public static string GetVariableKey(Guid executionId, string variableName)
    {
        return $"pe:{executionId}:var:{variableName.Trim()}";
    }

    public static string GetFullStateKey(Guid executionId)
    {
        return $"pe:{executionId}:state";
    }

    public static string NormalizePinKey(string pinKey)
    {
        return pinKey.Trim();
    }
}
