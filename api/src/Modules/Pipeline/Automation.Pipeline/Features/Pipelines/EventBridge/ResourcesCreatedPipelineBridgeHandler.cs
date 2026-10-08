using System.Text.Json;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
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
        var targetPipelines = await db
            .Pipelines.AsNoTracking()
            .Where(x =>
                x.ProjectId == message.ProjectId
                && x.TriggerType == PipelineTriggerType.OnResourceCreated
            )
            .ToListAsync(ct);

        if (targetPipelines.Count == 0)
        {
            return;
        }

        logger.LogInformation(
            "Found {Count} event-triggered pipeline(s) matching OnResourceCreated for Project '{ProjectId}', Repository '{RepositoryId}'.",
            targetPipelines.Count,
            message.ProjectId,
            message.RepositoryId
        );

        foreach (var pipeline in targetPipelines)
        {
            Guid? targetRepoId = null;
            HashSet<string>? allowedExts = null;

            if (pipeline.TriggerConfig != null)
            {
                var root = pipeline.TriggerConfig.RootElement;

                // 1. Check Repository filter
                if (
                    root.TryGetProperty("repositoryId", out var repoProp)
                    && repoProp.ValueKind == JsonValueKind.String
                )
                {
                    if (Guid.TryParse(repoProp.GetString(), out var rId))
                        targetRepoId = rId;
                }

                // 2. Check Extension filter
                if (root.TryGetProperty("extensions", out var extsProp))
                {
                    allowedExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    if (extsProp.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var item in extsProp.EnumerateArray())
                        {
                            var s = item.GetString();
                            if (!string.IsNullOrWhiteSpace(s))
                                allowedExts.Add(s.TrimStart('.').ToLowerInvariant());
                        }
                    }
                    else if (extsProp.ValueKind == JsonValueKind.String)
                    {
                        var s = extsProp.GetString();
                        if (!string.IsNullOrWhiteSpace(s))
                        {
                            foreach (
                                var part in s.Split(
                                    ',',
                                    StringSplitOptions.RemoveEmptyEntries
                                        | StringSplitOptions.TrimEntries
                                )
                            )
                            {
                                allowedExts.Add(part.TrimStart('.').ToLowerInvariant());
                            }
                        }
                    }
                }
                else if (
                    root.TryGetProperty("extension", out var extProp)
                    && extProp.ValueKind == JsonValueKind.String
                )
                {
                    var s = extProp.GetString();
                    if (!string.IsNullOrWhiteSpace(s))
                    {
                        allowedExts = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                        {
                            s.TrimStart('.').ToLowerInvariant(),
                        };
                    }
                }
            }

            // Bỏ qua nếu cấu hình repo khác với repo phát sinh event
            if (targetRepoId.HasValue && targetRepoId.Value != message.RepositoryId)
            {
                continue;
            }

            // Lọc các resource versions khớp với cấu hình allowedExts (nếu có)
            var matchedVersions = message
                .ResourceVersions.Where(rv =>
                {
                    if (allowedExts == null || allowedExts.Count == 0)
                        return true;

                    var rvExt = rv.Extension?.TrimStart('.').ToLowerInvariant();
                    if (string.IsNullOrEmpty(rvExt) && !string.IsNullOrEmpty(rv.RelativePath))
                    {
                        var dotIdx = rv.RelativePath.LastIndexOf('.');
                        if (dotIdx >= 0)
                        {
                            rvExt = rv.RelativePath[(dotIdx + 1)..].ToLowerInvariant();
                        }
                    }

                    return !string.IsNullOrEmpty(rvExt) && allowedExts.Contains(rvExt);
                })
                .ToList();

            if (matchedVersions.Count == 0)
            {
                continue;
            }

            // Gom toàn bộ Resource vừa tạo thành danh sách (Batch) và bổ sung Repository, Runner
            var runtimeInputs = new Dictionary<string, object?>
            {
                ["Resources"] = matchedVersions
                    .Select(v => $"resource:{v.ResourceVersionId}")
                    .ToList(),
                ["Repository"] = $"repository:{message.RepositoryId}",
                ["Runner"] = $"runner:{message.RunnerId}",
            };

            logger.LogInformation(
                "Auto-triggering Pipeline '{PipelineName}' ({PipelineId}) with batch of {Count} ResourceVersion(s) in Repository '{RepositoryId}', Runner '{RunnerId}'.",
                pipeline.Name,
                pipeline.Id,
                matchedVersions.Count,
                message.RepositoryId,
                message.RunnerId
            );

            await bus.InvokeAsync<Result<PipelineExecutionDto>>(
                new RunPipelineCommand(pipeline.Id, runtimeInputs),
                ct
            );
        }
    }
}
