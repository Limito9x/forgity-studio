using System.Collections.Concurrent;
using System.Text.Json;
using Automation.Pipeline.Engine;
using Automation.Pipeline.Engine.Models;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace Automation.Pipeline.Infrastructure.Redis;

public class RedisExecutionStateStore : IExecutionStateStore
{
    private readonly IConnectionMultiplexer? _redis;
    private readonly ILogger<RedisExecutionStateStore> _logger;
    private static readonly TimeSpan DefaultTtl = TimeSpan.FromHours(48);

    // In-memory fallback if Redis is unavailable or in unit tests
    private readonly ConcurrentDictionary<string, string> _memoryFallback = new();
    private readonly ConcurrentDictionary<string, HashSet<string>> _setFallback = new();

    public RedisExecutionStateStore(
        ILogger<RedisExecutionStateStore> logger,
        IConnectionMultiplexer? redis = null
    )
    {
        _logger = logger;
        _redis = redis;
    }

    private IDatabase? GetDatabase()
    {
        try
        {
            return _redis?.IsConnected == true ? _redis.GetDatabase() : null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get Redis database, proceeding with in-memory fallback.");
            return null;
        }
    }

    private static string StartInputKey(Guid execId, string key) =>
        $"exec:{execId}:input:{key}";

    private static string NodeOutputKey(Guid execId, Guid nodeId, string pinKey) =>
        $"exec:{execId}:node:{nodeId}:out:{pinKey}";

    private static string NodeStatusKey(Guid execId, Guid nodeId) =>
        $"exec:{execId}:node:{nodeId}:status";

    private static string FullStateKey(Guid execId) =>
        $"exec:{execId}:state";

    public async Task SetStartInputAsync(Guid execId, string key, object? value, CancellationToken ct = default)
    {
        var redisKey = StartInputKey(execId, key);
        var json = JsonSerializer.Serialize(value);

        var db = GetDatabase();
        if (db == null)
        {
            _memoryFallback[redisKey] = json;
            _setFallback.GetOrAdd($"exec:{execId}:inputs", _ => new HashSet<string>()).Add(key);
            return;
        }

        await db.StringSetAsync(redisKey, json, DefaultTtl);
        await db.SetAddAsync($"exec:{execId}:inputs", key);
    }

    public async Task<object?> GetStartInputAsync(Guid execId, string key, CancellationToken ct = default)
    {
        var redisKey = StartInputKey(execId, key);
        var db = GetDatabase();
        if (db == null)
        {
            return _memoryFallback.TryGetValue(redisKey, out var s) ? DeserializeValue(s) : null;
        }

        var val = await db.StringGetAsync(redisKey);
        if (!val.HasValue) return null;

        return DeserializeValue(val!);
    }

    public async Task<Dictionary<string, object?>> GetAllStartInputsAsync(Guid execId, CancellationToken ct = default)
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var db = GetDatabase();
        if (db == null)
        {
            if (_setFallback.TryGetValue($"exec:{execId}:inputs", out var keys))
            {
                foreach (var k in keys)
                {
                    result[k] = await GetStartInputAsync(execId, k, ct);
                }
            }
            return result;
        }

        var inputKeys = await db.SetMembersAsync($"exec:{execId}:inputs");
        foreach (var k in inputKeys)
        {
            var keyStr = k.ToString();
            var val = await GetStartInputAsync(execId, keyStr, ct);
            result[keyStr] = val;
        }

        return result;
    }

    public async Task SetNodeOutputAsync(Guid execId, Guid nodeId, string pinKey, object? value, CancellationToken ct = default)
    {
        var redisKey = NodeOutputKey(execId, nodeId, pinKey);
        var json = JsonSerializer.Serialize(value);

        var db = GetDatabase();
        if (db == null)
        {
            _memoryFallback[redisKey] = json;
            _setFallback.GetOrAdd($"exec:{execId}:node:{nodeId}:pins", _ => new HashSet<string>()).Add(pinKey);
            _setFallback.GetOrAdd($"exec:{execId}:nodes", _ => new HashSet<string>()).Add(nodeId.ToString());
            return;
        }

        await db.StringSetAsync(redisKey, json, DefaultTtl);
        await db.SetAddAsync($"exec:{execId}:node:{nodeId}:pins", pinKey);
        await db.SetAddAsync($"exec:{execId}:nodes", nodeId.ToString());
    }

    public async Task<object?> GetNodeOutputAsync(Guid execId, Guid nodeId, string pinKey, CancellationToken ct = default)
    {
        var redisKey = NodeOutputKey(execId, nodeId, pinKey);
        var db = GetDatabase();
        if (db == null)
        {
            return _memoryFallback.TryGetValue(redisKey, out var s) ? DeserializeValue(s) : null;
        }

        var val = await db.StringGetAsync(redisKey);
        if (!val.HasValue) return null;

        return DeserializeValue(val!);
    }

    public async Task<Dictionary<string, object?>> GetNodeAllOutputsAsync(Guid execId, Guid nodeId, CancellationToken ct = default)
    {
        var result = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        var db = GetDatabase();
        if (db == null)
        {
            if (_setFallback.TryGetValue($"exec:{execId}:node:{nodeId}:pins", out var pins))
            {
                foreach (var pin in pins)
                {
                    result[pin] = await GetNodeOutputAsync(execId, nodeId, pin, ct);
                }
            }
            return result;
        }

        var pinKeys = await db.SetMembersAsync($"exec:{execId}:node:{nodeId}:pins");
        foreach (var pin in pinKeys)
        {
            var pinStr = pin.ToString();
            var val = await GetNodeOutputAsync(execId, nodeId, pinStr, ct);
            result[pinStr] = val;
        }

        return result;
    }

    public async Task SetNodeOutputsAsync(Guid execId, Guid nodeId, Dictionary<string, object?> outputs, CancellationToken ct = default)
    {
        foreach (var (k, v) in outputs)
        {
            await SetNodeOutputAsync(execId, nodeId, k, v, ct);
        }
    }

    public async Task SetNodeStatusAsync(Guid execId, Guid nodeId, string status, CancellationToken ct = default)
    {
        var redisKey = NodeStatusKey(execId, nodeId);
        var db = GetDatabase();
        if (db == null)
        {
            _memoryFallback[redisKey] = status;
            return;
        }

        await db.StringSetAsync(redisKey, status, DefaultTtl);
    }

    public async Task<string?> GetNodeStatusAsync(Guid execId, Guid nodeId, CancellationToken ct = default)
    {
        var redisKey = NodeStatusKey(execId, nodeId);
        var db = GetDatabase();
        if (db == null)
        {
            return _memoryFallback.TryGetValue(redisKey, out var s) ? s : null;
        }

        var val = await db.StringGetAsync(redisKey);
        return val.HasValue ? val.ToString() : null;
    }

    public async Task<PipelineExecutionState> GetFullStateAsync(Guid execId, CancellationToken ct = default)
    {
        var db = GetDatabase();
        if (db == null)
        {
            if (_memoryFallback.TryGetValue(FullStateKey(execId), out var stateJsonFallback))
            {
                try
                {
                    var doc = JsonDocument.Parse(stateJsonFallback);
                    return PipelineExecutionState.FromJsonDocument(doc);
                }
                catch { }
            }

            var st = new PipelineExecutionState();
            var inputs = await GetAllStartInputsAsync(execId, ct);
            foreach (var (k, v) in inputs)
            {
                st.RuntimeInputs[k] = v;
            }

            if (_setFallback.TryGetValue($"exec:{execId}:nodes", out var nodeIdsFallback))
            {
                foreach (var nIdRedis in nodeIdsFallback)
                {
                    if (Guid.TryParse(nIdRedis, out var nGuid))
                    {
                        var nodeOutputs = await GetNodeAllOutputsAsync(execId, nGuid, ct);
                        st.SetNodeOutputs(nGuid, nodeOutputs);
                    }
                }
            }

            return st;
        }

        // 1. Check if snapshot state exists
        var stateJson = await db.StringGetAsync(FullStateKey(execId));
        if (stateJson.HasValue)
        {
            try
            {
                var doc = JsonDocument.Parse(stateJson.ToString());
                return PipelineExecutionState.FromJsonDocument(doc);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to parse state snapshot from Redis for execution {ExecutionId}", execId);
            }
        }

        // 2. Build state dynamically from individual Redis keys
        var state = new PipelineExecutionState();
        var startInputs = await GetAllStartInputsAsync(execId, ct);
        foreach (var (k, v) in startInputs)
        {
            state.RuntimeInputs[k] = v;
        }

        var nodeIds = await db.SetMembersAsync($"exec:{execId}:nodes");
        foreach (var nIdRedis in nodeIds)
        {
            if (Guid.TryParse(nIdRedis.ToString(), out var nGuid))
            {
                var nodeOutputs = await GetNodeAllOutputsAsync(execId, nGuid, ct);
                state.SetNodeOutputs(nGuid, nodeOutputs);
            }
        }

        return state;
    }

    public async Task SaveFullStateAsync(Guid execId, PipelineExecutionState state, CancellationToken ct = default)
    {
        var json = JsonSerializer.Serialize(state);
        var db = GetDatabase();
        if (db == null)
        {
            _memoryFallback[FullStateKey(execId)] = json;
            foreach (var (k, v) in state.RuntimeInputs)
            {
                await SetStartInputAsync(execId, k, v, ct);
            }
            foreach (var (nIdStr, outputs) in state.NodeOutputs)
            {
                if (Guid.TryParse(nIdStr, out var nGuid))
                {
                    foreach (var (pin, val) in outputs)
                    {
                        await SetNodeOutputAsync(execId, nGuid, pin, val, ct);
                    }
                }
            }
            return;
        }

        // Persist snapshot
        await db.StringSetAsync(FullStateKey(execId), json, DefaultTtl);

        // Also sync runtime inputs & node outputs
        foreach (var (k, v) in state.RuntimeInputs)
        {
            await SetStartInputAsync(execId, k, v, ct);
        }

        foreach (var (nIdStr, outputs) in state.NodeOutputs)
        {
            if (Guid.TryParse(nIdStr, out var nGuid))
            {
                foreach (var (pin, val) in outputs)
                {
                    await SetNodeOutputAsync(execId, nGuid, pin, val, ct);
                }
            }
        }
    }

    public async Task ExpireExecutionAsync(Guid execId, TimeSpan ttl, CancellationToken ct = default)
    {
        var db = GetDatabase();
        if (db == null)
        {
            _memoryFallback.TryRemove(FullStateKey(execId), out _);
            _setFallback.TryRemove($"exec:{execId}:inputs", out _);
            _setFallback.TryRemove($"exec:{execId}:nodes", out _);
            return;
        }

        await db.KeyExpireAsync(FullStateKey(execId), ttl);
        await db.KeyExpireAsync($"exec:{execId}:inputs", ttl);
        await db.KeyExpireAsync($"exec:{execId}:nodes", ttl);
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
                _ => json
            };
        }
        catch
        {
            return json;
        }
    }
}
