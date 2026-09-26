using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Features.Pipelines.Dtos;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Repository.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Pipeline.Features.Pipelines.EventBridge;

[NonTransactional]
public class ResourcesCreatedPipelineBridgeHandler(
    PipelineDbContext db,
    IMessageBus bus,
    ILogger<ResourcesCreatedPipelineBridgeHandler> logger
)
{
    public async Task Handle(ResourcesCreatedEvent message, CancellationToken ct)
    {
        var targetPipelines = await db.Pipelines
            .AsNoTracking()
            .Where(x => x.ProjectId == message.ProjectId &&
                        x.TriggerType == PipelineTriggerType.OnResourceCreated &&
                        (x.TriggerWorkspaceId == null || x.TriggerWorkspaceId == message.WorkspaceId))
            .ToListAsync(ct);

        if (targetPipelines.Count == 0)
        {
            return;
        }

        logger.LogInformation(
            "Found {Count} event-triggered pipeline(s) matching OnResourceCreated for Project '{ProjectId}', Workspace '{WorkspaceId}'.",
            targetPipelines.Count,
            message.ProjectId,
            message.WorkspaceId
        );

        foreach (var pipeline in targetPipelines)
        {
            foreach (var rv in message.ResourceVersions)
            {
                if (pipeline.TriggerConfig != null)
                {
                    var root = pipeline.TriggerConfig.RootElement;

                    // 1. Check workspace filter if specified in TriggerConfig
                    if (root.TryGetProperty("workspaceId", out var wsProp) && wsProp.ValueKind == System.Text.Json.JsonValueKind.String)
                    {
                        if (Guid.TryParse(wsProp.GetString(), out var filterWsId) && filterWsId != message.WorkspaceId)
                        {
                            continue;
                        }
                    }

                    // 2. Check extension filter if specified in TriggerConfig
                    HashSet<string>? allowedExts = null;
                    if (root.TryGetProperty("extensions", out var extsProp))
                    {
                        allowedExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        if (extsProp.ValueKind == System.Text.Json.JsonValueKind.Array)
                        {
                            foreach (var item in extsProp.EnumerateArray())
                            {
                                var s = item.GetString();
                                if (!string.IsNullOrWhiteSpace(s))
                                    allowedExts.Add(s.TrimStart('.').ToLowerInvariant());
                            }
                        }
                        else if (extsProp.ValueKind == System.Text.Json.JsonValueKind.String)
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
                    else if (root.TryGetProperty("extension", out var extProp) && extProp.ValueKind == System.Text.Json.JsonValueKind.String)
                    {
                        var s = extProp.GetString();
                        if (!string.IsNullOrWhiteSpace(s))
                        {
                            allowedExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { s.TrimStart('.').ToLowerInvariant() };
                        }
                    }

                    if (allowedExts != null && allowedExts.Count > 0)
                    {
                        var rvExt = rv.Extension?.TrimStart('.').ToLowerInvariant();
                        if (string.IsNullOrEmpty(rvExt) && !string.IsNullOrEmpty(rv.RelativePath))
                        {
                            var dotIdx = rv.RelativePath.LastIndexOf('.');
                            if (dotIdx >= 0)
                            {
                                rvExt = rv.RelativePath[(dotIdx + 1)..].ToLowerInvariant();
                            }
                        }

                        if (!string.IsNullOrEmpty(rvExt) && !allowedExts.Contains(rvExt))
                        {
                            logger.LogInformation(
                                "Skipping auto-trigger Pipeline '{PipelineName}' ({PipelineId}) for ResourceVersion '{ResourceVersionId}' because extension '{Extension}' is not in allowed extensions ({Allowed}).",
                                pipeline.Name,
                                pipeline.Id,
                                rv.ResourceVersionId,
                                rvExt,
                                string.Join(", ", allowedExts)
                            );
                            continue;
                        }
                    }
                }

                var runtimeInputs = new Dictionary<string, object?>
                {
                    ["Resource"] = $"resource:{rv.ResourceVersionId}",
                    ["Workspace"] = $"workspace:{message.WorkspaceId}"
                };

                logger.LogInformation(
                    "Auto-triggering Pipeline '{PipelineName}' ({PipelineId}) for ResourceVersion '{ResourceVersionId}'.",
                    pipeline.Name,
                    pipeline.Id,
                    rv.ResourceVersionId
                );

                await bus.InvokeAsync<Result<PipelineExecutionDto>>(
                    new RunPipelineCommand(pipeline.Id, message.AgentId, runtimeInputs),
                    ct
                );
            }
        }
    }
}
