using Automation.Pipeline.Domain.Entities;

namespace Automation.Pipeline.Contracts.NodeContract;

public interface INodeContractResolver
{
    Task<NodeContractResolutionContext> BuildContextAsync(
        Domain.Entities.Pipeline pipeline,
        CancellationToken ct = default);

    ResolvedNodeContract ResolveNode(
        PipelineNode node,
        NodeContractResolutionContext context);

    IReadOnlyDictionary<Guid, ResolvedNodeContract> ResolveAllNodes(
        IReadOnlyCollection<PipelineNode> nodes,
        NodeContractResolutionContext context);
}

