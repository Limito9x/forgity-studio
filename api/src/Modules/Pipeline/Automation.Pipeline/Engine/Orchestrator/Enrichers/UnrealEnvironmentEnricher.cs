using System.Text.Json;
using Automation.Runner.Contracts;
using Microsoft.Extensions.Logging;

namespace Automation.Pipeline.Engine.Orchestrator.Enrichers;

public class UnrealEnvironmentEnricher(ILogger<UnrealEnvironmentEnricher> logger) : IExecutorEnvironmentEnricher
{
    public string Executor => "unreal";

    public Task EnrichAsync(
        Dictionary<string, object?> envConfig,
        RunnerExecutorConfigDto? runnerConfig,
        Guid projectId,
        Guid runnerId,
        CancellationToken ct = default
    )
    {
        if (envConfig.TryGetValue("registeredProjects", out var regObj) && regObj != null)
        {
            var projIdStr = projectId.ToString();
            string? projectPath = null;

            if (regObj is JsonElement jsonElem && jsonElem.ValueKind == JsonValueKind.Object)
            {
                if (jsonElem.TryGetProperty(projIdStr, out var prop))
                {
                    projectPath = prop.GetString();
                }
            }
            else if (regObj is IDictionary<string, object?> dict && dict.TryGetValue(projIdStr, out var val))
            {
                projectPath = val?.ToString();
            }

            if (!string.IsNullOrWhiteSpace(projectPath))
            {
                envConfig["projectPath"] = projectPath;
                logger.LogInformation(
                    "Resolved Unreal Engine project path for Project {ProjectId}: {ProjectPath}",
                    projectId,
                    projectPath
                );
            }
            else
            {
                logger.LogWarning(
                    "Runner {RunnerId} has no registered Unreal project for Project {ProjectId}",
                    runnerId,
                    projectId
                );
            }
        }

        return Task.CompletedTask;
    }
}
