using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Engine.ExecPlanner;

public interface IExecPlanner
{
    ExecPlan BuildExecPlan(
        Domain.Entities.Pipeline pipeline,
        IReadOnlyList<NodeDefinition> customDefinitions,
        IToolRegistry toolRegistry,
        Dictionary<string, object?>? runtimeInputs = null,
        IReadOnlyDictionary<Guid, ResolvedNodeContract>? resolvedContracts = null
    );
}
