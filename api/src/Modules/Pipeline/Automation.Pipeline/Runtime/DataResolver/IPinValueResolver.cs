using Automation.Pipeline.Runtime.Planner.Models;
namespace Automation.Pipeline.Runtime.DataResolver;

public interface IPinValueResolver
{
    Task<object?> ResolvePinAsync(
        Guid executionId,
        Guid nodeId,
        string pinKey,
        ScopeContext? scope = null,
        CancellationToken ct = default
    );

    Task<Dictionary<string, object?>> ResolveAllPinsAsync(
        Guid executionId,
        Guid nodeId,
        IEnumerable<string>? requestedPinKeys = null,
        ScopeContext? scope = null,
        CancellationToken ct = default
    );
}
