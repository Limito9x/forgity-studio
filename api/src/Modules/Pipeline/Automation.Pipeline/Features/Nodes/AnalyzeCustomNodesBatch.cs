using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Wolverine.Attributes;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.Parsers;
using Automation.Pipeline.Infrastructure.Persistence;

namespace Automation.Pipeline.Features.Nodes;

public record ScriptBatchItem(
    string FileName,
    string ScriptContent
);

public record AnalyzeCustomNodesBatchCommand(
    Guid ProjectId,
    List<ScriptBatchItem> Scripts
);

public record PinDiffItem(
    string PinId,
    string Label,
    string PrimitiveType,
    string Cardinality,
    string DiffKind // "Added", "Removed", "TypeChanged"
);

public record ScriptImpactReportDto(
    int AffectedPipelineCount,
    int AffectedNodeCount,
    int AffectedEdgeCount,
    List<string> AffectedPipelineNames
);

public record AnalyzedCustomNodeDto(
    string FileName,
    string Key,
    string SuggestedName,
    string SuggestedLabel,
    string Executor,
    string? Description,
    string ContentHash,
    bool IsOverride,
    Guid? ExistingNodeId,
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs,
    IReadOnlyList<PinDiffItem> InputPinDiffs,
    IReadOnlyList<PinDiffItem> OutputPinDiffs,
    ScriptImpactReportDto ImpactReport
);

public record AnalyzeCustomNodesBatchResponseDto(
    IReadOnlyList<AnalyzedCustomNodeDto> Nodes
);

public class AnalyzeCustomNodesBatchValidator : AbstractValidator<AnalyzeCustomNodesBatchCommand>
{
    public AnalyzeCustomNodesBatchValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Scripts).NotEmpty().WithMessage("At least one script must be provided.");
        RuleFor(x => x.Scripts).Must(x => x == null || x.Count <= 100).WithMessage("A batch can contain at most 100 scripts.");
    }
}

public class AnalyzeCustomNodesBatchEndpoint(IMessageBus bus)
    : Endpoint<AnalyzeCustomNodesBatchCommand, AnalyzeCustomNodesBatchResponseDto>
{
    public override void Configure()
    {
        Post("custom/analyze-batch");
        Group<NodesGroup>();
        Description(x => x.WithName("AnalyzeCustomNodesBatch"));
        Permissions(P.Pipeline.GetAll);
    }

    public override async Task HandleAsync(AnalyzeCustomNodesBatchCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<AnalyzeCustomNodesBatchResponseDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class AnalyzeCustomNodesBatchHandler(PipelineDbContext db)
{
    public async Task<Result<AnalyzeCustomNodesBatchResponseDto>> HandleAsync(
        AnalyzeCustomNodesBatchCommand command,
        CancellationToken ct
    )
    {
        var existingNodes = await db.NodeDefinitions
            .Where(x => x.ProjectId == command.ProjectId)
            .ToListAsync(ct);

        var analyzedList = new List<AnalyzedCustomNodeDto>();
        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var script in command.Scripts)
        {
            var content = script.ScriptContent ?? string.Empty;
            var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(content));
            var contentHash = Convert.ToHexStringLower(hashBytes);

            var parsed = PythonScriptSchemaParser.Parse(content, script.FileName);
            var key = parsed.SuggestedName.Replace(" ", "-").ToLowerInvariant();
            if (!keys.Add(key))
                return Result.Fail<AnalyzeCustomNodesBatchResponseDto>($"Multiple scripts resolve to node key '{key}'. Use distinct script names.");

            var existingNode = existingNodes.FirstOrDefault(x =>
                x.Key.Equals(key, StringComparison.OrdinalIgnoreCase));

            var inputPinDiffs = new List<PinDiffItem>();
            var outputPinDiffs = new List<PinDiffItem>();
            var impactReport = new ScriptImpactReportDto(0, 0, 0, []);
            bool isOverride = existingNode != null;
            Guid? existingId = existingNode?.Id;

            if (existingNode != null)
            {
                // Calculate Input Pin Diffs
                var oldInputsMap = existingNode.Inputs.ToDictionary(p => p.Id, StringComparer.OrdinalIgnoreCase);
                var newInputsMap = parsed.Inputs.ToDictionary(p => p.Id, StringComparer.OrdinalIgnoreCase);

                foreach (var newPin in parsed.Inputs)
                {
                    if (!oldInputsMap.TryGetValue(newPin.Id, out var oldPin))
                    {
                        inputPinDiffs.Add(new PinDiffItem(newPin.Id, newPin.Label, newPin.PrimitiveType.ToString(), newPin.Cardinality.ToString(), "Added"));
                    }
                    else if (oldPin.PrimitiveType != newPin.PrimitiveType)
                    {
                        inputPinDiffs.Add(new PinDiffItem(newPin.Id, newPin.Label, $"{oldPin.PrimitiveType} -> {newPin.PrimitiveType}", newPin.Cardinality.ToString(), "TypeChanged"));
                    }
                }

                foreach (var oldPin in existingNode.Inputs)
                {
                    if (!newInputsMap.ContainsKey(oldPin.Id))
                    {
                        inputPinDiffs.Add(new PinDiffItem(oldPin.Id, oldPin.Label, oldPin.PrimitiveType.ToString(), oldPin.Cardinality.ToString(), "Removed"));
                    }
                }

                // Calculate Output Pin Diffs
                var oldOutputsMap = existingNode.Outputs.ToDictionary(p => p.Id, StringComparer.OrdinalIgnoreCase);
                var newOutputsMap = parsed.Outputs.ToDictionary(p => p.Id, StringComparer.OrdinalIgnoreCase);

                foreach (var newPin in parsed.Outputs)
                {
                    if (!oldOutputsMap.TryGetValue(newPin.Id, out var oldPin))
                    {
                        outputPinDiffs.Add(new PinDiffItem(newPin.Id, newPin.Label, newPin.PrimitiveType.ToString(), newPin.Cardinality.ToString(), "Added"));
                    }
                    else if (oldPin.PrimitiveType != newPin.PrimitiveType)
                    {
                        outputPinDiffs.Add(new PinDiffItem(newPin.Id, newPin.Label, $"{oldPin.PrimitiveType} -> {newPin.PrimitiveType}", newPin.Cardinality.ToString(), "TypeChanged"));
                    }
                }

                foreach (var oldPin in existingNode.Outputs)
                {
                    if (!newOutputsMap.ContainsKey(oldPin.Id))
                    {
                        outputPinDiffs.Add(new PinDiffItem(oldPin.Id, oldPin.Label, oldPin.PrimitiveType.ToString(), oldPin.Cardinality.ToString(), "Removed"));
                    }
                }

                // Impact Analysis: query pipeline nodes using this key
                var pipelineNodes = await db.PipelineNodes
                    .Where(n => n.RefId == existingNode.Key)
                    .ToListAsync(ct);

                if (pipelineNodes.Count > 0)
                {
                    var pipelineNodeIds = pipelineNodes.Select(n => n.Id).ToHashSet();
                    var pipelineIds = pipelineNodes.Select(n => n.PipelineId).Distinct().ToList();

                    var pipelineNames = await db.Pipelines
                        .Where(p => pipelineIds.Contains(p.Id))
                        .Select(p => p.Name)
                        .ToListAsync(ct);

                    // Find edges attached to removed or type-changed pins
                    var brokenInputPinIds = inputPinDiffs
                        .Where(d => d.DiffKind is "Removed" or "TypeChanged")
                        .Select(d => d.PinId)
                        .ToHashSet(StringComparer.OrdinalIgnoreCase);

                    var brokenOutputPinIds = outputPinDiffs
                        .Where(d => d.DiffKind is "Removed" or "TypeChanged")
                        .Select(d => d.PinId)
                        .ToHashSet(StringComparer.OrdinalIgnoreCase);

                    var affectedEdgeCount = await db.PipelineEdges
                        .CountAsync(e =>
                            (pipelineNodeIds.Contains(e.TargetPipelineNodeId) && brokenInputPinIds.Contains(e.TargetPin)) ||
                            (pipelineNodeIds.Contains(e.SourcePipelineNodeId) && brokenOutputPinIds.Contains(e.SourcePin)),
                            ct
                        );

                    impactReport = new ScriptImpactReportDto(
                        pipelineIds.Count,
                        pipelineNodes.Count,
                        affectedEdgeCount,
                        pipelineNames
                    );
                }
            }

            analyzedList.Add(new AnalyzedCustomNodeDto(
                script.FileName,
                key,
                parsed.SuggestedName,
                parsed.SuggestedLabel,
                parsed.Executor,
                parsed.Description,
                contentHash,
                isOverride,
                existingId,
                parsed.Inputs,
                parsed.Outputs,
                inputPinDiffs,
                outputPinDiffs,
                impactReport
            ));
        }

        return Result.Ok(new AnalyzeCustomNodesBatchResponseDto(analyzedList));
    }
}
