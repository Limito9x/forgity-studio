using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Runtime.Planner.Models;
using Automation.Pipeline.Contracts.Tools;
namespace Automation.Pipeline.Runtime.Planner;

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
