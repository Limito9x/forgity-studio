using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Engine.Models;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Engine.ExecPlanner;

public class ExecPlanner : IExecPlanner
{
    public ExecPlan BuildExecPlan(
        Domain.Entities.Pipeline pipeline,
        IReadOnlyList<NodeDefinition> customDefinitions,
        IToolRegistry toolRegistry,
        Dictionary<string, object?>? runtimeInputs = null
    )
    {
        var execEdges = pipeline.Edges
            .Where(e => e.Kind == EdgeKind.Exec ||
                        IsLoopBodyPin(e.SourcePin) ||
                        IsCompletedPin(e.SourcePin) ||
                        (!string.IsNullOrWhiteSpace(e.SourcePin) && IsExecOutPin(e.SourcePin)) ||
                        (!string.IsNullOrWhiteSpace(e.TargetPin) && IsExecInPin(e.TargetPin)))
            .ToList();

        var cycleNodeIds = new List<string>();

        // 1. Build Frozen Execution Graph (O(1) in-memory lookup & Stage-Worker-Runner Binding with Plug over Select)
        var graph = FrozenExecutionGraph.Create(pipeline, toolRegistry, runtimeInputs);

        // 2. Build Exec Steps Lookup via Step Factory
        var stepsLookup = ExecStepFactory.BuildStepsLookup(pipeline, customDefinitions, toolRegistry);

        // 3. Discover Entry Point and Trace Scoped Exec Segments
        var segments = BuildScopedExecSegments(pipeline, graph, stepsLookup, execEdges, cycleNodeIds);

        // 4. Pre-flight Pin Validation via Plan Validator
        var unresolvedPins = ExecPlanValidator.ValidateRequiredPins(segments, runtimeInputs);

        return new ExecPlan
        {
            Segments = segments,
            CycleNodeIds = cycleNodeIds,
            UnresolvedPins = unresolvedPins,
            Graph = graph
        };
    }

    private List<ExecSegment> BuildScopedExecSegments(
        Domain.Entities.Pipeline pipeline,
        FrozenExecutionGraph graph,
        Dictionary<Guid, ExecStep> stepsLookup,
        List<PipelineEdge> execEdges,
        List<string> cycleNodeIds
    )
    {
        var segments = new List<ExecSegment>();

        // 1. Root Start Node (StageId == null)
        var startStep = stepsLookup.Values.FirstOrDefault(s =>
            s.StageId == null &&
            s.Kind == PipelineNodeKind.Start);

        if (startStep != null)
        {
            segments.Add(new ExecSegment("dotNet")
            {
                Steps = [startStep]
            });
        }

        // 2. Discover container nodes and infer DAG dependencies
        var containerNodes = pipeline.Nodes
            .Where(n => n.Kind == PipelineNodeKind.Container)
            .ToList();

        var containerIds = containerNodes.Select(c => c.Id).ToHashSet();
        var nodesById = pipeline.Nodes.ToDictionary(n => n.Id);
        var containerDependencies = new HashSet<(Guid Source, Guid Target)>();

        foreach (var edge in pipeline.Edges)
        {
            // Inter-container edge between child nodes (data wire or exec wire across containers)
            if (nodesById.TryGetValue(edge.SourcePipelineNodeId, out var srcNode) &&
                nodesById.TryGetValue(edge.TargetPipelineNodeId, out var tgtNode))
            {
                var srcContainerId = srcNode.ParentId;
                var tgtContainerId = tgtNode.ParentId;

                if (srcContainerId.HasValue && tgtContainerId.HasValue &&
                    srcContainerId.Value != tgtContainerId.Value &&
                    containerIds.Contains(srcContainerId.Value) &&
                    containerIds.Contains(tgtContainerId.Value))
                {
                    containerDependencies.Add((srcContainerId.Value, tgtContainerId.Value));
                }
            }
        }

        var sortedContainers = SortContainersTopologically(containerNodes, containerDependencies, cycleNodeIds);

        // 3. For each Container, trace intra-container steps
        foreach (var container in sortedContainers)
        {
            var containerSteps = stepsLookup.Values
                .Where(s => s.StageId == container.Id)
                .ToDictionary(s => s.NodeId);

            if (containerSteps.Count == 0)
            {
                continue;
            }

            var intraExecEdges = execEdges
                .Where(e => containerSteps.ContainsKey(e.SourcePipelineNodeId) &&
                            containerSteps.ContainsKey(e.TargetPipelineNodeId))
                .ToList();

            var intraTargets = intraExecEdges.Select(e => e.TargetPipelineNodeId).ToHashSet();

            // Implicit Entry Point: Action step inside this container with no incoming intra-exec edge
            var entryStep = containerSteps.Values.FirstOrDefault(s => !intraTargets.Contains(s.NodeId));

            if (entryStep == null)
            {
                // All nodes in this container have incoming exec edges -> intra-container cycle!
                foreach (var step in containerSteps.Values)
                {
                    cycleNodeIds.Add(step.NodeId.ToString());
                }
                continue;
            }

            var visited = new HashSet<Guid>();
            var recursionStack = new HashSet<Guid>();

            var stageSegments = TraceIntraContainerChain(
                container,
                graph,
                entryStep.NodeId,
                containerSteps,
                intraExecEdges,
                visited,
                recursionStack,
                cycleNodeIds
            );

            segments.AddRange(stageSegments);
        }

        // 3b. Trace root action steps (if pipeline has nodes outside containers)
        var rootActionSteps = stepsLookup.Values
            .Where(s => s.StageId == null &&
                        s.Kind != PipelineNodeKind.Start &&
                        s.Kind != PipelineNodeKind.Return)
            .ToDictionary(s => s.NodeId);

        if (rootActionSteps.Count > 0)
        {
            var rootExecEdges = execEdges
                .Where(e => rootActionSteps.ContainsKey(e.SourcePipelineNodeId) &&
                            rootActionSteps.ContainsKey(e.TargetPipelineNodeId))
                .ToList();

            var rootTargets = rootExecEdges.Select(e => e.TargetPipelineNodeId).ToHashSet();
            var entryStep = rootActionSteps.Values.FirstOrDefault(s => !rootTargets.Contains(s.NodeId));

            if (entryStep != null)
            {
                var visited = new HashSet<Guid>();
                var recursionStack = new HashSet<Guid>();
                var pseudoContainer = new PipelineNode(Guid.Empty, pipeline.Id, "RootScope", PipelineNodeKind.Container, 0, 0);

                var rootSegments = TraceIntraContainerChain(
                    pseudoContainer,
                    graph,
                    entryStep.NodeId,
                    rootActionSteps,
                    rootExecEdges,
                    visited,
                    recursionStack,
                    cycleNodeIds
                );
                segments.AddRange(rootSegments);
            }
        }

        // 4. Root Return Node (StageId == null)
        var returnStep = stepsLookup.Values.FirstOrDefault(s =>
            s.StageId == null &&
            s.Kind == PipelineNodeKind.Return);

        if (returnStep != null)
        {
            segments.Add(new ExecSegment("dotNet")
            {
                Steps = [returnStep]
            });
        }

        return segments;
    }

    private static List<PipelineNode> SortContainersTopologically(
        IReadOnlyCollection<PipelineNode> containers,
        HashSet<(Guid Source, Guid Target)> dependencies,
        List<string> cycleNodeIds
    )
    {
        var containersById = containers.ToDictionary(s => s.Id);
        var inDegree = containers.ToDictionary(s => s.Id, _ => 0);
        var adj = containers.ToDictionary(s => s.Id, _ => new List<Guid>());

        foreach (var (src, tgt) in dependencies)
        {
            if (containersById.ContainsKey(src) && containersById.ContainsKey(tgt))
            {
                adj[src].Add(tgt);
                inDegree[tgt]++;
            }
        }

        var queue = new Queue<Guid>(
            containers
                .Where(s => inDegree[s.Id] == 0)
                .OrderBy(s => s.Position.X)
                .ThenBy(s => s.Position.Y)
                .Select(s => s.Id)
        );

        var sorted = new List<PipelineNode>();
        while (queue.Count > 0)
        {
            var currentId = queue.Dequeue();
            sorted.Add(containersById[currentId]);

            foreach (var neighborId in adj[currentId])
            {
                inDegree[neighborId]--;
                if (inDegree[neighborId] == 0)
                {
                    queue.Enqueue(neighborId);
                }
            }
        }

        if (sorted.Count < containers.Count)
        {
            foreach (var container in containers)
            {
                if (inDegree[container.Id] > 0)
                {
                    cycleNodeIds.Add(container.Id.ToString());
                }
            }
        }

        return sorted;
    }

    private List<ExecSegment> TraceIntraContainerChain(
        PipelineNode container,
        FrozenExecutionGraph graph,
        Guid? startNodeId,
        Dictionary<Guid, ExecStep> containerStepsLookup,
        List<PipelineEdge> intraExecEdges,
        HashSet<Guid> visited,
        HashSet<Guid> recursionStack,
        List<string> cycleNodeIds
    )
    {
        var segments = new List<ExecSegment>();
        ExecSegment? currentSegment = null;
        var currentNodeId = startNodeId;

        var containerExecutor = "dotNet";
        Guid? targetRunnerId = null;

        // Ưu tiên đọc từ StageWorkerBinding (đã giải quyết Plug over Select: cắm dây pin "runner" ghi đè header select)
        if (graph.StageBindings.TryGetValue(container.Id, out var stageBinding))
        {
            containerExecutor = stageBinding.Executor;
            targetRunnerId = stageBinding.EffectiveRunnerId;
        }
        else if (container.Metadata != null && container.Metadata.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object)
        {
            if (container.Metadata.RootElement.TryGetProperty("executor", out var execProp))
                containerExecutor = execProp.GetString() ?? "dotNet";
            else if (container.Metadata.RootElement.TryGetProperty("executorKey", out var execKeyProp))
                containerExecutor = execKeyProp.GetString() ?? "dotNet";

            if (container.Metadata.RootElement.TryGetProperty("targetRunnerId", out var runnerProp) &&
                Guid.TryParse(runnerProp.GetString(), out var parsedRunnerId))
            {
                targetRunnerId = parsedRunnerId;
            }
        }

        var containerName = container.RefId;
        if (container.Config != null && container.Config.RootElement.ValueKind == System.Text.Json.JsonValueKind.Object &&
            container.Config.RootElement.TryGetProperty("label", out var labelProp))
        {
            containerName = labelProp.GetString() ?? containerName;
        }

        while (currentNodeId.HasValue)
        {
            var cId = currentNodeId.Value;

            if (recursionStack.Contains(cId))
            {
                cycleNodeIds.Add(cId.ToString());
                break;
            }

            if (!containerStepsLookup.TryGetValue(cId, out var step) || !visited.Add(cId))
            {
                break;
            }

            recursionStack.Add(cId);

            var isFlowControl = step.Kind == PipelineNodeKind.FlowControl;
            var isSubPipeline = step.Kind == PipelineNodeKind.SubPipeline;

            if (isFlowControl)
            {
                if (currentSegment != null && currentSegment.Steps.Count > 0)
                {
                    segments.Add(currentSegment);
                    currentSegment = null;
                }

                var fcSegment = new ExecSegment(
                    "dotNet",
                    isFlowControl: true,
                    stageId: container.Id,
                    stageName: containerName
                )
                {
                    Steps = [step]
                };

                var loopBodyEdge = intraExecEdges.FirstOrDefault(e =>
                    e.SourcePipelineNodeId == cId &&
                    IsLoopBodyPin(e.SourcePin));

                if (loopBodyEdge != null)
                {
                    var bodyVisited = new HashSet<Guid>(visited);
                    var bodyStack = new HashSet<Guid>(recursionStack);
                    var bodySegments = TraceIntraContainerChain(
                        container,
                        graph,
                        loopBodyEdge.TargetPipelineNodeId,
                        containerStepsLookup,
                        intraExecEdges,
                        bodyVisited,
                        bodyStack,
                        cycleNodeIds
                    );
                    fcSegment.BodyPlan = new ExecPlan { Segments = bodySegments };
                }

                segments.Add(fcSegment);

                var completedEdge = intraExecEdges.FirstOrDefault(e =>
                    e.SourcePipelineNodeId == cId &&
                    IsCompletedPin(e.SourcePin));

                recursionStack.Remove(cId);
                currentNodeId = completedEdge?.TargetPipelineNodeId;
                continue;
            }

            if (isSubPipeline)
            {
                if (currentSegment != null && currentSegment.Steps.Count > 0)
                {
                    segments.Add(currentSegment);
                    currentSegment = null;
                }

                var subSegment = new ExecSegment(
                    "dotNet",
                    isSubPipeline: true,
                    stageId: container.Id,
                    stageName: containerName
                )
                {
                    Steps = [step]
                };

                segments.Add(subSegment);

                var nextSubEdge = intraExecEdges.FirstOrDefault(e =>
                    e.SourcePipelineNodeId == cId &&
                    IsExecOutPin(e.SourcePin));

                recursionStack.Remove(cId);
                currentNodeId = nextSubEdge?.TargetPipelineNodeId;
                continue;
            }

            // Normal Action Step inside Container: fuse all contiguous action steps of this container into a single segment
            if (currentSegment == null)
            {
                currentSegment = new ExecSegment(
                    containerExecutor,
                    stageId: container.Id,
                    stageName: containerName,
                    targetRunnerId: targetRunnerId
                )
                {
                    Steps = [step]
                };
            }
            else
            {
                currentSegment.Steps.Add(step);
            }

            var nextEdge = intraExecEdges.FirstOrDefault(e =>
                e.SourcePipelineNodeId == cId &&
                IsExecOutPin(e.SourcePin));

            if (nextEdge != null && recursionStack.Contains(nextEdge.TargetPipelineNodeId))
            {
                cycleNodeIds.Add(nextEdge.TargetPipelineNodeId.ToString());
                break;
            }

            recursionStack.Remove(cId);
            currentNodeId = nextEdge?.TargetPipelineNodeId;
        }

        if (currentSegment != null && currentSegment.Steps.Count > 0)
        {
            segments.Add(currentSegment);
        }

        return segments;
    }

    private static bool IsLoopBodyPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return false;
        var norm = pin.Replace(" ", "").Replace("_", "").Replace("-", "").ToLowerInvariant();
        return norm is "loopbody" or "body" or "loop";
    }

    private static bool IsCompletedPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return false;
        var norm = pin.Replace(" ", "").Replace("_", "").Replace("-", "").ToLowerInvariant();
        return norm is "completed" or "done" or "complete";
    }

    private static bool IsExecOutPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return true;
        var norm = pin.Replace(" ", "").Replace("_", "").Replace("-", "").ToLowerInvariant();
        return norm is "execout" or "exec";
    }

    private static bool IsExecInPin(string? pin)
    {
        if (string.IsNullOrWhiteSpace(pin)) return false;
        var norm = pin.Replace(" ", "").Replace("_", "").Replace("-", "").ToLowerInvariant();
        return norm is "execin" or "exec";
    }
}
