using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.ValueObjects;
namespace Automation.Pipeline.Contracts.NodeContract;

public sealed class NodeContractResolutionContext
{
    public Guid PipelineId { get; }
    public Guid ProjectId { get; }
    public IReadOnlyList<PipelineParameter> Parameters { get; }
    public IReadOnlyDictionary<string, NodeDefinition> CustomDefinitionsByKey { get; }
    public IReadOnlyDictionary<Guid, NodeDefinition> CustomDefinitionsById { get; }
    public IReadOnlyDictionary<Guid, Domain.Entities.Pipeline> SubPipelinesById { get; }

    public NodeContractResolutionContext(
        Guid pipelineId,
        Guid projectId,
        IReadOnlyList<PipelineParameter>? parameters = null,
        IReadOnlyDictionary<string, NodeDefinition>? customDefinitionsByKey = null,
        IReadOnlyDictionary<Guid, NodeDefinition>? customDefinitionsById = null,
        IReadOnlyDictionary<Guid, Domain.Entities.Pipeline>? subPipelinesById = null)
    {
        PipelineId = pipelineId;
        ProjectId = projectId;
        Parameters = parameters ?? [];
        CustomDefinitionsByKey = customDefinitionsByKey ?? new Dictionary<string, NodeDefinition>(StringComparer.OrdinalIgnoreCase);
        CustomDefinitionsById = customDefinitionsById ?? new Dictionary<Guid, NodeDefinition>();
        SubPipelinesById = subPipelinesById ?? new Dictionary<Guid, Domain.Entities.Pipeline>();
    }
}

