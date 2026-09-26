using System.Collections.Concurrent;
using Automation.Agent.Grpc;

namespace Automation.Runner.Features.Connections;

public class CommandTracker : ICommandTracker
{
    private readonly ConcurrentDictionary<string, TaskCompletionSource<CommandResponse>> _pendingCommands = new();

    public Task<CommandResponse> RegisterCommandAsync(string commandId, CancellationToken cancellationToken = default)
    {
        var tcs = new TaskCompletionSource<CommandResponse>(TaskCreationOptions.RunContinuationsAsynchronously);

        _pendingCommands[commandId] = tcs;

        if (cancellationToken.CanBeCanceled)
        {
            cancellationToken.Register(() =>
            {
                if (_pendingCommands.TryRemove(commandId, out var removedTcs))
                {
                    removedTcs.TrySetCanceled(cancellationToken);
                }
            });
        }

        return tcs.Task;
    }

    public bool CompleteCommand(CommandResponse response)
    {
        if (_pendingCommands.TryRemove(response.CommandId, out var tcs))
        {
            return tcs.TrySetResult(response);
        }
        return false;
    }

    public bool FailCommand(string commandId, string errorMessage)
    {
        if (_pendingCommands.TryRemove(commandId, out var tcs))
        {
            return tcs.TrySetException(new InvalidOperationException(errorMessage));
        }
        return false;
    }
}
