namespace Automation.Runner.Features.Connections;

public interface IRunnerConnectionRegistry
{
    void Add(RunnerConnection connection);
    bool TryGet(Guid runnerId, out RunnerConnection? connection);
    bool Remove(Guid runnerId, Guid connectionId);
    bool Contain(Guid runnerId);
}

// Backward-compatibility alias
public interface IAgentConnectionRegistry : IRunnerConnectionRegistry
{
}
