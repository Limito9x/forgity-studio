using System.Text.Json;

namespace Automation.Pipeline.Runtime.Features.Execution.EventBridge;

public enum PipelineTriggerExecutionMode
{
    Always = 0,
    AskBefore = 1
}

public record ParsedPipelineTriggerConfig(
    PipelineTriggerExecutionMode TriggerMode,
    bool AllowAllRepositories,
    IReadOnlySet<Guid> RepositoryIds,
    IReadOnlySet<string> AllowedExtensions
)
{
    public bool IsRepositoryMatch(Guid repositoryId)
    {
        if (AllowAllRepositories) return true;
        return RepositoryIds.Contains(repositoryId);
    }

    public bool IsExtensionMatch(string? extension, string? relativePath)
    {
        if (AllowedExtensions.Count == 0) return true;

        var ext = extension?.TrimStart('.').ToLowerInvariant();
        if (string.IsNullOrEmpty(ext) && !string.IsNullOrEmpty(relativePath))
        {
            var dotIdx = relativePath.LastIndexOf('.');
            if (dotIdx >= 0)
            {
                ext = relativePath[(dotIdx + 1)..].ToLowerInvariant();
            }
        }

        return !string.IsNullOrEmpty(ext) && AllowedExtensions.Contains(ext);
    }
}

public static class PipelineTriggerConfigParser
{
    public static ParsedPipelineTriggerConfig Parse(JsonDocument? triggerConfig)
    {
        if (triggerConfig == null)
        {
            return new ParsedPipelineTriggerConfig(
                TriggerMode: PipelineTriggerExecutionMode.Always,
                AllowAllRepositories: false,
                RepositoryIds: new HashSet<Guid>(),
                AllowedExtensions: new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            );
        }

        var root = triggerConfig.RootElement;
        var triggerMode = PipelineTriggerExecutionMode.Always;
        var allowAllRepos = false;
        var repoIds = new HashSet<Guid>();
        var allowedExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // 1. Trigger Mode (Always vs AskBefore)
        if (root.TryGetProperty("triggerMode", out var modeProp) && modeProp.ValueKind == JsonValueKind.String)
        {
            var modeStr = modeProp.GetString();
            if (string.Equals(modeStr, "AskBefore", StringComparison.OrdinalIgnoreCase))
            {
                triggerMode = PipelineTriggerExecutionMode.AskBefore;
            }
        }

        // 2. Allow All Repositories flag
        if (root.TryGetProperty("allowAllRepositories", out var allRepoProp))
        {
            if (allRepoProp.ValueKind is JsonValueKind.True or JsonValueKind.False)
            {
                allowAllRepos = allRepoProp.GetBoolean();
            }
        }

        // 3. Repository IDs (Array + Legacy single string fallback)
        if (root.TryGetProperty("repositoryIds", out var reposProp) && reposProp.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in reposProp.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String && Guid.TryParse(item.GetString(), out var g))
                {
                    repoIds.Add(g);
                }
            }
        }

        if (root.TryGetProperty("repositoryId", out var singleRepoProp) && singleRepoProp.ValueKind == JsonValueKind.String)
        {
            if (Guid.TryParse(singleRepoProp.GetString(), out var g))
            {
                repoIds.Add(g);
            }
        }

        // 4. File Extension Filter
        if (root.TryGetProperty("extensions", out var extsProp))
        {
            if (extsProp.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in extsProp.EnumerateArray())
                {
                    var s = item.GetString();
                    if (!string.IsNullOrWhiteSpace(s))
                    {
                        allowedExts.Add(s.TrimStart('.').ToLowerInvariant());
                    }
                }
            }
            else if (extsProp.ValueKind == JsonValueKind.String)
            {
                var s = extsProp.GetString();
                if (!string.IsNullOrWhiteSpace(s))
                {
                    foreach (var part in s.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                    {
                        allowedExts.Add(part.TrimStart('.').ToLowerInvariant());
                    }
                }
            }
        }
        else if (root.TryGetProperty("extension", out var extProp) && extProp.ValueKind == JsonValueKind.String)
        {
            var s = extProp.GetString();
            if (!string.IsNullOrWhiteSpace(s))
            {
                allowedExts.Add(s.TrimStart('.').ToLowerInvariant());
            }
        }

        return new ParsedPipelineTriggerConfig(
            TriggerMode: triggerMode,
            AllowAllRepositories: allowAllRepos,
            RepositoryIds: repoIds,
            AllowedExtensions: allowedExts
        );
    }
}

