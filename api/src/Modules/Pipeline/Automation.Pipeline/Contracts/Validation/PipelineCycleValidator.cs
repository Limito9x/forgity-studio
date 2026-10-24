using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
namespace Automation.Pipeline.Contracts.Validation;

public static class PipelineCycleValidator
{
    public static async Task<Result> ValidateNoCycleAsync(
        PipelineDbContext db,
        Guid parentPipelineId,
        Guid childPipelineId,
        CancellationToken ct = default
    )
    {
        if (parentPipelineId == childPipelineId)
        {
            return Result.Fail("A pipeline cannot contain itself as a sub-pipeline.");
        }

        var visited = new HashSet<Guid>();
        var queue = new Queue<Guid>();
        queue.Enqueue(childPipelineId);

        while (queue.Count > 0)
        {
            var currentPipelineId = queue.Dequeue();

            if (currentPipelineId == parentPipelineId)
            {
                return Result.Fail($"Cyclic dependency detected: Adding this sub-pipeline creates a cycle back to pipeline '{parentPipelineId}'.");
            }

            if (!visited.Add(currentPipelineId))
            {
                continue;
            }

            // Load subpipeline nodes of currentPipelineId
            var subNodes = await db.PipelineNodes
                .AsNoTracking()
                .Where(x => x.PipelineId == currentPipelineId && x.Kind == PipelineNodeKind.SubPipeline)
                .ToListAsync(ct);

            foreach (var node in subNodes)
            {
                Guid? targetId = null;

                if (Guid.TryParse(node.RefId, out var parsedRefId))
                {
                    targetId = parsedRefId;
                }
                else if (node.Config != null)
                {
                    try
                    {
                        if (node.Config.RootElement.TryGetProperty("pipelineId", out var pProp) && pProp.TryGetGuid(out var gid))
                        {
                            targetId = gid;
                        }
                        else if (node.Config.RootElement.TryGetProperty("targetPipelineId", out var tProp) && tProp.TryGetGuid(out var tid))
                        {
                            targetId = tid;
                        }
                    }
                    catch
                    {
                        // Ignore malformed config
                    }
                }

                if (targetId.HasValue && targetId.Value != Guid.Empty)
                {
                    if (targetId.Value == parentPipelineId)
                    {
                        return Result.Fail($"Cyclic dependency detected: Sub-pipeline '{targetId.Value}' contains a reference back to pipeline '{parentPipelineId}'.");
                    }
                    queue.Enqueue(targetId.Value);
                }
            }
        }

        return Result.Ok();
    }
}
