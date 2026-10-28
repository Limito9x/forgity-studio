using Automation.Pipeline.Contracts.NodeContract;
namespace Automation.Pipeline.Contracts.Validation;

public interface IPipelineContractValidator
{
    Task<PipelineContractValidationResult> ValidateGraphAsync(
        Domain.Entities.Pipeline pipeline,
        NodeContractResolutionContext? prebuiltContext = null,
        IReadOnlyDictionary<Guid, ResolvedNodeContract>? prebuiltContracts = null,
        CancellationToken ct = default);
}

