using System.Collections.Concurrent;

namespace Automation.Runner.Features.Connections;

public sealed class RunnerConnectionRegistry : IRunnerConnectionRegistry, IAgentConnectionRegistry
{
    private readonly ConcurrentDictionary<Guid, RunnerConnection> _connections = new();

    public void Add(RunnerConnection connection)
    {
        _connections[connection.RunnerId] = connection;
    }

    public bool TryGet(Guid runnerId, out RunnerConnection? connection)
    {
        return _connections.TryGetValue(runnerId, out connection);
    }

    public bool Remove(Guid runnerId, Guid connectionId)
    {
        if (!_connections.TryGetValue(runnerId, out var connection))
            return false;

        if (connection.ConnectionId != connectionId)
            return false;

        return _connections.TryRemove(runnerId, out _);
    }

    public bool Contain(Guid runnerId)
    {
        return _connections.ContainsKey(runnerId);
    }
}
