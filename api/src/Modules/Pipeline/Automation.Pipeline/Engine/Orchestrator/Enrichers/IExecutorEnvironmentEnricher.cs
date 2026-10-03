using Automation.Runner.Contracts;

namespace Automation.Pipeline.Engine.Orchestrator.Enrichers;

public interface IExecutorEnvironmentEnricher
{
    string Executor { get; }

    Task EnrichAsync(
        Dictionary<string, object?> envConfig,
        RunnerExecutorConfigDto? runnerConfig,
        Guid projectId,
        Guid runnerId,
        CancellationToken ct = default
    );
}
