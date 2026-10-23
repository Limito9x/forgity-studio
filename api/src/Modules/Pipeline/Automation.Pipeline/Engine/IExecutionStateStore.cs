using Automation.Pipeline.Engine.Models;

namespace Automation.Pipeline.Engine;

public interface IExecutionStateStore
{
    Task SetStartInputAsync(Guid execId, string key, object? value, CancellationToken ct = default);
    Task<object?> GetStartInputAsync(Guid execId, string key, CancellationToken ct = default);
    Task<Dictionary<string, object?>> GetAllStartInputsAsync(Guid execId, CancellationToken ct = default);

    Task SetNodeOutputAsync(Guid execId, Guid nodeId, string pinKey, object? value, CancellationToken ct = default);
    Task<object?> GetNodeOutputAsync(Guid execId, Guid nodeId, string pinKey, CancellationToken ct = default);
    Task<Dictionary<string, object?>> GetNodeAllOutputsAsync(Guid execId, Guid nodeId, CancellationToken ct = default);
    Task SetNodeOutputsAsync(Guid execId, Guid nodeId, Dictionary<string, object?> outputs, CancellationToken ct = default);

    Task SetNodeStatusAsync(Guid execId, Guid nodeId, string status, CancellationToken ct = default);
    Task<string?> GetNodeStatusAsync(Guid execId, Guid nodeId, CancellationToken ct = default);

    Task SetNodeErrorAsync(Guid execId, Guid nodeId, string? errorMessage, CancellationToken ct = default);
    Task<string?> GetNodeErrorAsync(Guid execId, Guid nodeId, CancellationToken ct = default);

    Task SetNodeLogAsync(Guid execId, Guid nodeId, string? log, CancellationToken ct = default);
    Task<string?> GetNodeLogAsync(Guid execId, Guid nodeId, CancellationToken ct = default);

    Task<PipelineExecutionState> GetFullStateAsync(Guid execId, CancellationToken ct = default);
    Task SaveFullStateAsync(Guid execId, PipelineExecutionState state, CancellationToken ct = default);

    Task ExpireExecutionAsync(Guid execId, TimeSpan ttl, CancellationToken ct = default);
}
