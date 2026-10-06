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

            if (string.IsNullOrWhiteSpace(projectPath))
            {
                // Fallback: single mapped project — use it when exact ProjectId not found
                if (regObj is JsonElement je && je.ValueKind == JsonValueKind.Object && je.EnumerateObject().Count() == 1)
                {
                    projectPath = je.EnumerateObject().First().Value.GetString();
                }
                else if (regObj is IDictionary<string, object?> d2 && d2.Count == 1)
                {
                    projectPath = d2.Values.FirstOrDefault()?.ToString();
                }
            }

            if (!string.IsNullOrWhiteSpace(projectPath))
            {
                // Canonical key expected by UnrealEngineExecutor._resolve_project_path
                envConfig["fullPathProject"] = projectPath;
                // Compat aliases for worker/other consumers
                envConfig["projectPath"] = projectPath;
                envConfig["uproject_path"] = projectPath;
                envConfig["ProjectPath"] = projectPath;
                logger.LogInformation(
                    "Resolved Unreal Engine project path for Project {ProjectId} on Runner {RunnerId}: {ProjectPath}",
                    projectId,
                    runnerId,
                    projectPath
                );
            }
            else
            {
                logger.LogWarning(
                    "Runner {RunnerId} has no registered Unreal project for Project {ProjectId}. Register a .uproject path for this Studio project in Studio → Runners → Unreal executor.",
                    runnerId,
                    projectId
                );
            }
        }

        return Task.CompletedTask;
    }
}
