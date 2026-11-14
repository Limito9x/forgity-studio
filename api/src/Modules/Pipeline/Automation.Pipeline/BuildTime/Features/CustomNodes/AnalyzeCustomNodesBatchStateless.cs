using System.Security.Cryptography;
using System.Text;
using Wolverine.Attributes;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.BuildTime.Services;
using Automation.Pipeline.Contracts.StructRegistry;

namespace Automation.Pipeline.BuildTime.Features.CustomNodes;

public record StatelessScriptBatchItem(
    string Key,
    string FileName,
    string FullPath,
    string ScriptContent,
    string ContentHash
);

public record AnalyzeCustomNodesBatchStatelessCommand(
    Guid ProjectId,
    List<StatelessScriptBatchItem> Scripts
);

public record AnalyzedStatelessNodeDto(
    string Key,
    string FileName,
    string FullPath,
    string SuggestedName,
    string SuggestedLabel,
    string Executor,
    string? Description,
    string ContentHash,
    IReadOnlyList<PinDefinition> Inputs,
    IReadOnlyList<PinDefinition> Outputs,
    IReadOnlyList<ScriptDependencyDto>? Dependencies = null
);

public record AnalyzeCustomNodesBatchStatelessResponseDto(
    IReadOnlyList<AnalyzedStatelessNodeDto> Nodes
);

public class AnalyzeCustomNodesBatchStatelessValidator : AbstractValidator<AnalyzeCustomNodesBatchStatelessCommand>
{
    public AnalyzeCustomNodesBatchStatelessValidator()
    {
        RuleFor(x => x.ProjectId).NotEmpty();
        RuleFor(x => x.Scripts).NotEmpty().WithMessage("At least one script must be provided.");
        RuleFor(x => x.Scripts).Must(x => x == null || x.Count <= 200).WithMessage("A batch can contain at most 200 scripts.");
    }
}

public class AnalyzeCustomNodesBatchStatelessEndpoint(IMessageBus bus)
    : Endpoint<AnalyzeCustomNodesBatchStatelessCommand, AnalyzeCustomNodesBatchStatelessResponseDto>
{
    public override void Configure()
    {
        Post("custom/analyze-batch-stateless");
        Group<NodesGroup>();
        Description(x => x.WithName("AnalyzeCustomNodesBatchStateless"));
        Permissions(P.Pipeline.GetAll);
    }

    public override async Task HandleAsync(AnalyzeCustomNodesBatchStatelessCommand req, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<Result<AnalyzeCustomNodesBatchStatelessResponseDto>>(req, ct);
        await this.SendResultAsync(result, ct);
    }
}

[NonTransactional]
public class AnalyzeCustomNodesBatchStatelessHandler(
    IScriptSchemaAnalyzer analyzer,
    IEntityStructRegistry structRegistry
)
{
    public async Task<Result<AnalyzeCustomNodesBatchStatelessResponseDto>> HandleAsync(
        AnalyzeCustomNodesBatchStatelessCommand command,
        CancellationToken ct
    )
    {
        var analyzedList = new List<AnalyzedStatelessNodeDto>();
        var registeredStructs = structRegistry.GetAll(command.ProjectId)
            .ToDictionary(s => s.StructType, StringComparer.OrdinalIgnoreCase);

        foreach (var script in command.Scripts)
        {
            var content = script.ScriptContent ?? string.Empty;
            var hash = script.ContentHash;
            if (string.IsNullOrWhiteSpace(hash))
            {
                var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(content));
                hash = Convert.ToHexStringLower(hashBytes);
            }

            var parsed = await analyzer.AnalyzeAsync(content, script.FileName, ct);

            // Re-validate & enrich struct types if any pin refers to registered structs
            var enrichedInputs = parsed.Inputs.Select(p =>
            {
                if (!string.IsNullOrWhiteSpace(p.StructType) && registeredStructs.TryGetValue(p.StructType, out var def))
                {
                    return p with { StructType = def.StructType };
                }
                return p;
            }).ToList();

            var enrichedOutputs = parsed.Outputs.Select(p =>
            {
                if (!string.IsNullOrWhiteSpace(p.StructType) && registeredStructs.TryGetValue(p.StructType, out var def))
                {
                    return p with { StructType = def.StructType };
                }
                return p;
            }).ToList();

            analyzedList.Add(new AnalyzedStatelessNodeDto(
                script.Key,
                script.FileName,
                script.FullPath,
                parsed.SuggestedName,
                parsed.SuggestedLabel,
                parsed.Executor,
                parsed.Description,
                hash,
                enrichedInputs,
                enrichedOutputs,
                parsed.Dependencies
            ));
        }

        return Result.Ok(new AnalyzeCustomNodesBatchStatelessResponseDto(analyzedList));
    }
}

