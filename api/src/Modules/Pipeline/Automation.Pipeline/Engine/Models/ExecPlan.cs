namespace Automation.Pipeline.Engine.Models;

public class ExecPlan
{
    public List<ExecSegment> Segments { get; init; } = [];
    public List<string> CycleNodeIds { get; init; } = [];
    public List<UnresolvedPin> UnresolvedPins { get; init; } = [];
    public FrozenExecutionGraph? Graph { get; init; }

    public bool IsValid => CycleNodeIds.Count == 0 && UnresolvedPins.Count == 0;

    public IEnumerable<ExecStep> GetAllSteps()
    {
        foreach (var segment in Segments)
        {
            foreach (var step in segment.Steps)
            {
                yield return step;
            }

            if (segment.BodyPlan != null)
            {
                foreach (var step in segment.BodyPlan.GetAllSteps())
                {
                    yield return step;
                }
            }

            if (segment.ContinuationPlan != null)
            {
                foreach (var step in segment.ContinuationPlan.GetAllSteps())
                {
                    yield return step;
                }
            }
        }
    }

    public ExecStep? FindStep(Guid nodeId)
    {
        return GetAllSteps().FirstOrDefault(s => s.NodeId == nodeId);
    }
}
