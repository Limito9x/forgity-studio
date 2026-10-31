using System.Text.Json;
using Automation.Pipeline.BuildTime.Features.Authoring.Dtos;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Infrastructure.Persistence;
using Automation.Repository.Contracts;
using FluentResults;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Wolverine;
using Wolverine.Attributes;

namespace Automation.Pipeline.Runtime.Features.Execution.EventBridge;

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
            var parsed = PipelineTriggerConfigParser.Parse(pipeline.TriggerConfig);

            // 1. Check Repository Scope (Multi-repo or AllowAllRepositories)
            if (!parsed.IsRepositoryMatch(message.RepositoryId))
            {
                continue;
            }

            // 2. Check Trigger Mode (Always vs AskBefore)
            if (parsed.TriggerMode == PipelineTriggerExecutionMode.AskBefore)
            {
                if (message.ApprovedPipelineIds == null || !message.ApprovedPipelineIds.Contains(pipeline.Id))
                {
                    logger.LogDebug(
                        "Pipeline '{PipelineName}' ({PipelineId}) skipped: mode is AskBefore and not approved in sync session.",
                        pipeline.Name,
                        pipeline.Id
                    );
                    continue;
                }
            }

            // 3. Filter Resource Versions matching extensions
            var matchedVersions = message
                .ResourceVersions.Where(rv => parsed.IsExtensionMatch(rv.Extension, rv.RelativePath))
                .ToList();

            if (matchedVersions.Count == 0)
            {
                continue;
            }

            // 4. Per-Resource Queue Dispatch: 1 Resource = 1 Pipeline Execution in Queue
            logger.LogInformation(
                "Auto-triggering Pipeline '{PipelineName}' ({PipelineId}) queueing {Count} execution(s) for Repository '{RepositoryId}', Runner '{RunnerId}'.",
                pipeline.Name,
                pipeline.Id,
                matchedVersions.Count,
                message.RepositoryId,
                message.RunnerId
            );

            foreach (var rv in matchedVersions)
            {
                var runtimeInputs = new Dictionary<string, object?>
                {
                    ["Resource"] = $"resource:{rv.ResourceVersionId}",
                    ["Resources"] = new List<string> { $"resource:{rv.ResourceVersionId}" }
                };

                if (message.WorkstationId.HasValue && message.WorkstationId.Value != Guid.Empty)
                {
                    runtimeInputs["Workstation"] = $"workstation:{message.WorkstationId.Value}";
                }

                logger.LogInformation(
                    "Enqueuing RunPipeline for '{PipelineName}' ({PipelineId}) with ResourceVersion '{VersionId}' ({Path}).",
                    pipeline.Name,
                    pipeline.Id,
                    rv.ResourceVersionId,
                    rv.RelativePath ?? rv.Extension
                );

                await bus.InvokeAsync<Result<PipelineExecutionDto>>(
                    new RunPipelineCommand(pipeline.Id, runtimeInputs, IsEventTrigger: true),
                    ct
                );
            }
        }
    }
}
