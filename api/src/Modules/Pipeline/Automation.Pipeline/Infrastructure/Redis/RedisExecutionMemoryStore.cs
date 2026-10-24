using System.Collections.Concurrent;
using System.Text.Json;
using Automation.Pipeline.Runtime.DataResolver;
using Automation.Pipeline.Runtime.Planner.Models;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace Automation.Pipeline.Infrastructure.Redis;

public class RedisExecutionMemoryStore(
    ILogger<RedisExecutionMemoryStore> logger,
    IConnectionMultiplexer? redis = null
) : IExecutionMemoryStore
{
    private static readonly TimeSpan DefaultTtl = TimeSpan.FromHours(48);

    // In-memory fallback if Redis is unavailable
    private readonly ConcurrentDictionary<string, string> _memoryFallback = new();

    private IDatabase? GetDatabase()
    {
        try
        {
            return redis?.IsConnected == true ? redis.GetDatabase() : null;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to get Redis database, falling back to in-memory store.");
            return null;
        }
    }

    public async Task<object?> GetNodePinValueAsync(
        Guid executionId,
        Guid nodeId,
        string pinKey,
        ScopeContext? scope = null,
        CancellationToken ct = default
    )
    {
        var redisKey = RedisKeyStrategy.GetNodePinKey(executionId, nodeId, pinKey, scope);
        var db = GetDatabase();

        if (db != null)
        {
            var val = await db.StringGetAsync(redisKey);
            if (val.HasValue) return DeserializeValue(val!);

            // Try normalized pin key
            var normKey = NormalizeKey(pinKey);
            if (!string.Equals(normKey, pinKey, StringComparison.OrdinalIgnoreCase))
            {
                var normRedisKey = RedisKeyStrategy.GetNodePinKey(executionId, nodeId, normKey, scope);
                var normVal = await db.StringGetAsync(normRedisKey);
                if (normVal.HasValue) return DeserializeValue(normVal!);
            }
        }
        else
        {
            if (_memoryFallback.TryGetValue(redisKey, out var memVal))
                return DeserializeValue(memVal);

            var normKey = NormalizeKey(pinKey);
            if (!string.Equals(normKey, pinKey, StringComparison.OrdinalIgnoreCase) &&
                _memoryFallback.TryGetValue(RedisKeyStrategy.GetNodePinKey(executionId, nodeId, normKey, scope), out var normMemVal))
            {
                return DeserializeValue(normMemVal);
            }
        }

        // Fallback: Inspect all recorded pins of this node
        try
        {
            var allOutputs = await GetNodeAllOutputsAsync(executionId, nodeId, scope, ct);
            if (allOutputs.Count > 0)
            {
                if (allOutputs.TryGetValue(pinKey, out var direct) && direct != null)
                    return direct;

                var normTarget = NormalizeKey(pinKey);
                foreach (var (k, v) in allOutputs)
                {
                    if (v != null && string.Equals(NormalizeKey(k), normTarget, StringComparison.OrdinalIgnoreCase))
                    {
                        return v;
                    }
                }
            }
        }
        catch { }

        return null;
    }

    public async Task SetNodePinValueAsync(
        Guid executionId,
        Guid nodeId,
        string pinKey,
        object? value,
        ScopeContext? scope = null,
        CancellationToken ct = default
    )
    {
        var redisKey = RedisKeyStrategy.GetNodePinKey(executionId, nodeId, pinKey, scope);
        var json = JsonSerializer.Serialize(value);
        var db = GetDatabase();

        if (db != null)
        {
            await db.StringSetAsync(redisKey, json, DefaultTtl);
            var pinListKey = $"pe:{executionId}:node:{nodeId}:pins";
            await db.SetAddAsync(pinListKey, pinKey);

            var normKey = NormalizeKey(pinKey);
            if (!string.Equals(normKey, pinKey, StringComparison.OrdinalIgnoreCase))
            {
                var normRedisKey = RedisKeyStrategy.GetNodePinKey(executionId, nodeId, normKey, scope);
                await db.StringSetAsync(normRedisKey, json, DefaultTtl);
            }
        }
        else
        {
            _memoryFallback[redisKey] = json;
            var normKey = NormalizeKey(pinKey);
            if (!string.Equals(normKey, pinKey, StringComparison.OrdinalIgnoreCase))
            {
                var normRedisKey = RedisKeyStrategy.GetNodePinKey(executionId, nodeId, normKey, scope);
                _memoryFallback[normRedisKey] = json;
            }
        }
    }

    private static string NormalizeKey(string k) => k.Replace("_", "").Replace("-", "").Replace(" ", "");

    public async Task<Dictionary<string, object?>> GetNodeAllOutputsAsync(
        Guid executionId,
        Guid nodeId,
        ScopeContext? scope = null,
        CancellationToken ct = default
    )
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var db = GetDatabase();

        if (db != null)
        {
            var pinListKey = $"pe:{executionId}:node:{nodeId}:pins";
            var pinKeys = await db.SetMembersAsync(pinListKey);
            foreach (var pin in pinKeys)
            {
                var pinStr = pin.ToString();
                var val = await GetNodePinValueAsync(executionId, nodeId, pinStr, scope, ct);
                result[pinStr] = val;
            }
        }

        return result;
    }

    public async Task SetNodeAllOutputsAsync(
        Guid executionId,
        Guid nodeId,
        Dictionary<string, object?> outputs,
        ScopeContext? scope = null,
        CancellationToken ct = default
    )
    {
        foreach (var (pin, val) in outputs)
        {
            await SetNodePinValueAsync(executionId, nodeId, pin, val, scope, ct);
        }
    }

    public async Task<object?> GetStartInputAsync(
        Guid executionId,
        string inputKey,
        CancellationToken ct = default
    )
    {
        var redisKey = RedisKeyStrategy.GetStartInputKey(executionId, inputKey);
        var db = GetDatabase();

        if (db != null)
        {
            var val = await db.StringGetAsync(redisKey);
            return val.HasValue ? DeserializeValue(val!) : null;
        }

        return _memoryFallback.TryGetValue(redisKey, out var memVal) ? DeserializeValue(memVal) : null;
    }

    public async Task SetStartInputAsync(
        Guid executionId,
        string inputKey,
        object? value,
        CancellationToken ct = default
    )
    {
        var redisKey = RedisKeyStrategy.GetStartInputKey(executionId, inputKey);
        var json = JsonSerializer.Serialize(value);
        var db = GetDatabase();

        if (db != null)
        {
            await db.StringSetAsync(redisKey, json, DefaultTtl);
        }
        else
        {
            _memoryFallback[redisKey] = json;
        }
    }

    public async Task<object?> GetVariableAsync(
        Guid executionId,
        string variableName,
        CancellationToken ct = default
    )
    {
        var redisKey = RedisKeyStrategy.GetVariableKey(executionId, variableName);
        var db = GetDatabase();

        if (db != null)
        {
            var val = await db.StringGetAsync(redisKey);
            return val.HasValue ? DeserializeValue(val!) : null;
        }

        return _memoryFallback.TryGetValue(redisKey, out var memVal) ? DeserializeValue(memVal) : null;
    }

    public async Task SetVariableAsync(
        Guid executionId,
        string variableName,
        object? value,
        CancellationToken ct = default
    )
    {
        var redisKey = RedisKeyStrategy.GetVariableKey(executionId, variableName);
        var json = JsonSerializer.Serialize(value);
        var db = GetDatabase();

        if (db != null)
        {
            await db.StringSetAsync(redisKey, json, DefaultTtl);
            var varListKey = $"pe:{executionId}:variables";
            await db.SetAddAsync(varListKey, variableName.Trim());
        }
        else
        {
            _memoryFallback[redisKey] = json;
        }
    }

    private static object? DeserializeValue(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            return doc.RootElement.ValueKind switch
            {
                JsonValueKind.String => doc.RootElement.GetString(),
                JsonValueKind.Number => doc.RootElement.TryGetInt64(out var l) ? l : doc.RootElement.GetDouble(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.Null or JsonValueKind.Undefined => null,
                JsonValueKind.Object => JsonSerializer.Deserialize<Dictionary<string, object?>>(json),
                JsonValueKind.Array => JsonSerializer.Deserialize<List<object?>>(json),
                _ => json
            };
        }
        catch
        {
            return json;
        }
    }
}
