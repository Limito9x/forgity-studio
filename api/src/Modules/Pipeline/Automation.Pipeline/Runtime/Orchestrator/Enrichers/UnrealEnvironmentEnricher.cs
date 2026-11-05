using System.Text.Json;
using Automation.Runner.Contracts;
using Microsoft.Extensions.Logging;
namespace Automation.Pipeline.Runtime.Orchestrator.Enrichers;

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

        // Resolve keep-alive duration (minutes) for persistent warm Unreal process pool
        var keepAliveMinutes = 0;
        var projIdString = projectId.ToString();

        if (envConfig.TryGetValue("projectKeepAliveMinutes", out var projKaObj) && projKaObj != null)
        {
            keepAliveMinutes = TryExtractMinutes(projKaObj, projIdString);
            if (keepAliveMinutes <= 0)
            {
                // Fallback: single mapped project keep-alive
                keepAliveMinutes = TryExtractSingleMinutes(projKaObj);
            }
        }

        if (keepAliveMinutes <= 0 && envConfig.TryGetValue("keepAliveMinutes", out var globalKaObj) && globalKaObj != null)
        {
            keepAliveMinutes = ParseMinutes(globalKaObj);
        }

        keepAliveMinutes = Math.Clamp(keepAliveMinutes, 0, 240);
        envConfig["keepAliveMinutes"] = keepAliveMinutes;

        if (keepAliveMinutes > 0)
        {
            logger.LogInformation(
                "Unreal Engine keep-alive active for Project {ProjectId} on Runner {RunnerId}: {KeepAliveMinutes} minutes",
                projectId,
                runnerId,
                keepAliveMinutes
            );
        }

        return Task.CompletedTask;
    }

    private static int TryExtractMinutes(object obj, string key)
    {
        if (obj is JsonElement jsonElem && jsonElem.ValueKind == JsonValueKind.Object)
        {
            if (jsonElem.TryGetProperty(key, out var prop))
            {
                return ParseMinutes(prop);
            }
        }
        else if (obj is IDictionary<string, object?> dict && dict.TryGetValue(key, out var val) && val != null)
        {
            return ParseMinutes(val);
        }
        return 0;
    }

    private static int TryExtractSingleMinutes(object obj)
    {
        if (obj is JsonElement je && je.ValueKind == JsonValueKind.Object && je.EnumerateObject().Count() == 1)
        {
            return ParseMinutes(je.EnumerateObject().First().Value);
        }
        else if (obj is IDictionary<string, object?> d && d.Count == 1)
        {
            var firstVal = d.Values.FirstOrDefault();
            return firstVal != null ? ParseMinutes(firstVal) : 0;
        }
        return 0;
    }

    private static int ParseMinutes(object val)
    {
        if (val is JsonElement je)
        {
            if (je.ValueKind == JsonValueKind.Number && je.TryGetInt32(out var num))
                return num;
            if (je.ValueKind == JsonValueKind.String && int.TryParse(je.GetString(), out var sNum))
                return sNum;
        }
        else if (val is int i)
            return i;
        else if (val is long l)
            return (int)l;
        else if (val is string s && int.TryParse(s, out var strNum))
            return strNum;

        return 0;
    }
}
