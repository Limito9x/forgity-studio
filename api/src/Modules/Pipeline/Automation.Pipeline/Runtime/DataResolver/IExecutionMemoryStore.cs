using Automation.Pipeline.Runtime.Planner.Models;
namespace Automation.Pipeline.Runtime.DataResolver;

public interface IExecutionMemoryStore
{
    Task<object?> GetNodePinValueAsync(
        Guid executionId,
        Guid nodeId,
        string pinKey,
        ScopeContext? scope = null,
        CancellationToken ct = default
    );

    Task SetNodePinValueAsync(
        Guid executionId,
        Guid nodeId,
        string pinKey,
        object? value,
        ScopeContext? scope = null,
        CancellationToken ct = default
    );

    Task<Dictionary<string, object?>> GetNodeAllOutputsAsync(
        Guid executionId,
        Guid nodeId,
        ScopeContext? scope = null,
        CancellationToken ct = default
    );

    Task SetNodeAllOutputsAsync(
        Guid executionId,
        Guid nodeId,
        Dictionary<string, object?> outputs,
        ScopeContext? scope = null,
        CancellationToken ct = default
    );

    Task<object?> GetStartInputAsync(
        Guid executionId,
        string inputKey,
        CancellationToken ct = default
    );

    Task SetStartInputAsync(
        Guid executionId,
        string inputKey,
        object? value,
        CancellationToken ct = default
    );

    Task<object?> GetVariableAsync(
        Guid executionId,
        string variableName,
        CancellationToken ct = default
    );

    Task SetVariableAsync(
        Guid executionId,
        string variableName,
        object? value,
        CancellationToken ct = default
    );
}
