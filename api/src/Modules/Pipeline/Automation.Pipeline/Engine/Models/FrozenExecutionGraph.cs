using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Engine.Analysis;
using Automation.Pipeline.Tools;

namespace Automation.Pipeline.Engine.Models;

/// <summary>
/// Bản đồ Đồ thị Đóng Băng Trong RAM (Frozen Execution Graph).
/// Được nạp và khởi tạo DUY NHẤT 1 LẦN khi bắt đầu một phiên chạy Pipeline.
/// Cung cấp các từ điển tra cứu O(1) tức thì, xóa bỏ 100% việc query database lặp lại trong Demand-Driven pull.
/// </summary>
public sealed class FrozenExecutionGraph
{
    public Guid PipelineId { get; init; }
    public Guid ProjectId { get; init; }

    public IReadOnlyDictionary<Guid, PipelineNode> NodesById { get; init; } =
        new Dictionary<Guid, PipelineNode>();
    public IReadOnlyDictionary<string, PipelineParameter> ParametersByKey { get; init; } =
        new Dictionary<string, PipelineParameter>(StringComparer.OrdinalIgnoreCase);
    public IReadOnlyList<PipelineEdge> Edges { get; init; } = [];

    // Tra cứu dây nối vào 1 chân pin cụ thể của 1 node O(1)
    public IReadOnlyDictionary<
        (Guid TargetNodeId, string CanonicalPin),
        PipelineEdge
    > InEdges { get; init; } =
        new Dictionary<(Guid TargetNodeId, string CanonicalPin), PipelineEdge>();

    // Tra cứu tất cả dây nối vào 1 node O(1)
    public IReadOnlyDictionary<
        Guid,
        IReadOnlyList<PipelineEdge>
    > InEdgesByTargetNode { get; init; } = new Dictionary<Guid, IReadOnlyList<PipelineEdge>>();

    // Tra cứu các dây nối từ 1 chân pin ra ngoài O(1)
    public IReadOnlyDictionary<
        (Guid SourceNodeId, string CanonicalPin),
        IReadOnlyList<PipelineEdge>
    > OutEdges { get; init; } =
        new Dictionary<(Guid SourceNodeId, string CanonicalPin), IReadOnlyList<PipelineEdge>>();

    // Bản đồ Stage -> Worker Executor -> Runner máy trạm (Hỗ trợ Plug over Select)
    public IReadOnlyDictionary<Guid, StageWorkerBinding> StageBindings { get; init; } =
        new Dictionary<Guid, StageWorkerBinding>();

    // Các pure node IDs được tính toán sẵn
    public HashSet<Guid> PureNodeIds { get; init; } = [];
    public HashSet<Guid> DynamicPureNodeIds { get; init; } = [];

    public PipelineNode? StartNode { get; init; }
    public PipelineNode? ReturnNode { get; init; }

    public static FrozenExecutionGraph Create(
        Domain.Entities.Pipeline pipeline,
        IToolRegistry toolRegistry,
        Dictionary<string, object?>? runtimeInputs = null
    )
    {
        var nodesById = pipeline.Nodes.ToDictionary(n => n.Id);

        // 1. Index Parameters by Key and Label
        var paramsDict = new Dictionary<string, PipelineParameter>(
            StringComparer.OrdinalIgnoreCase
        );
        foreach (var param in pipeline.Parameters)
        {
            if (!string.IsNullOrWhiteSpace(param.Key))
            {
                paramsDict[param.Key] = param;
            }
            if (!string.IsNullOrWhiteSpace(param.Label) && !paramsDict.ContainsKey(param.Label))
            {
                paramsDict[param.Label] = param;
            }
        }

        // 2. Index Edges
        var inEdges = new Dictionary<(Guid TargetNodeId, string CanonicalPin), PipelineEdge>();
        var inByTarget = new Dictionary<Guid, List<PipelineEdge>>();
        var outEdges =
            new Dictionary<(Guid SourceNodeId, string CanonicalPin), List<PipelineEdge>>();

        foreach (var edge in pipeline.Edges)
        {
            var targetKey = (edge.TargetPipelineNodeId, CanonicalPinKey.Normalize(edge.TargetPin));
            inEdges[targetKey] = edge;

            if (!inByTarget.TryGetValue(edge.TargetPipelineNodeId, out var targetList))
            {
                targetList = [];
                inByTarget[edge.TargetPipelineNodeId] = targetList;
            }
            targetList.Add(edge);

            var sourceKey = (edge.SourcePipelineNodeId, CanonicalPinKey.Normalize(edge.SourcePin));
            if (!outEdges.TryGetValue(sourceKey, out var sourceList))
            {
                sourceList = [];
                outEdges[sourceKey] = sourceList;
            }
            sourceList.Add(edge);
        }

        // 3. Pre-calculate Pure Nodes & Dynamic Nodes
        var pureIds = new HashSet<Guid>();
        foreach (var node in pipeline.Nodes)
        {
            if (toolRegistry.Get(node.RefId) is { IsPure: true })
            {
                pureIds.Add(node.Id);
            }
        }

        var dynamicNodes = PipelineGraphAnalyzer.AnalyzeDynamicNodes(pipeline, toolRegistry);

        // 4. Build Stage-Worker-Runner Bindings (Hỗ trợ Plug over Select)
        var stageBindings = new Dictionary<Guid, StageWorkerBinding>();
        var containerNodes = pipeline
            .Nodes.Where(n => n.Kind == PipelineNodeKind.Container)
            .ToList();

        foreach (var container in containerNodes)
        {
            var containerExecutor = "dotNet";
            Guid? configuredRunnerId = null;

            if (
                container.Metadata != null
                && container.Metadata.RootElement.ValueKind == JsonValueKind.Object
            )
            {
                if (container.Metadata.RootElement.TryGetProperty("executor", out var execProp))
                    containerExecutor = execProp.GetString() ?? "dotNet";
                else if (
                    container.Metadata.RootElement.TryGetProperty(
                        "executorKey",
                        out var execKeyProp
                    )
                )
                    containerExecutor = execKeyProp.GetString() ?? "dotNet";

                if (
                    container.Metadata.RootElement.TryGetProperty(
                        "targetRunnerId",
                        out var runnerProp
                    )
                    && runnerProp.GetString() is { } runnerStr
                    && Guid.TryParse(runnerStr, out var parsedRunnerId)
                )
                {
                    configuredRunnerId = parsedRunnerId;
                }
            }

            var containerName = container.RefId;
            if (
                container.Config != null
                && container.Config.RootElement.ValueKind == JsonValueKind.Object
                && container.Config.RootElement.TryGetProperty("label", out var labelProp)
            )
            {
                containerName = labelProp.GetString() ?? containerName;
            }

            // Quét xem có dây nối nào cắm vào cổng "runner" của Container không (Plug over Select)
            (Guid TargetNodeId, string CanonicalPin) runnerEdgeKey = (
                container.Id,
                CanonicalPinKey.Normalize("runner")
            );
            PipelineEdge? incomingRunnerEdge = inEdges.TryGetValue(runnerEdgeKey, out var foundEdge)
                ? foundEdge
                : null;

            // Nếu không tìm thấy bằng "runner", quét tất cả các incoming edge cắm vào container
            if (incomingRunnerEdge == null)
            {
                incomingRunnerEdge = pipeline.Edges.FirstOrDefault(e =>
                    e.TargetPipelineNodeId == container.Id
                    && (
                        CanonicalPinKey.Normalize(e.TargetPin)
                            is "runner"
                                or "runnerid"
                                or "agent"
                                or "agentid"
                                or "targetrunner"
                                or "targetrunnerid"
                        || e.TargetPin.ToLowerInvariant().Contains("runner")
                        || e.TargetPin.ToLowerInvariant().Contains("agent")
                    )
                );
            }

            Guid? effectiveRunnerId = configuredRunnerId;
            var bindingSource = StageBindingSource.HeaderSelect;
            Guid? boundSrcNodeId = null;
            string? boundSrcPin = null;

            if (incomingRunnerEdge != null)
            {
                boundSrcNodeId = incomingRunnerEdge.SourcePipelineNodeId;
                boundSrcPin = incomingRunnerEdge.SourcePin;
                bindingSource = StageBindingSource.DataWire;

                if (nodesById.TryGetValue(incomingRunnerEdge.SourcePipelineNodeId, out var srcNode))
                {
                    // Thu thập tất cả candidate keys từ Node nguồn (Start / Capsule / Input / Variable / Context)
                    var candidateKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    if (!string.IsNullOrWhiteSpace(incomingRunnerEdge.SourcePin))
                    {
                        candidateKeys.Add(incomingRunnerEdge.SourcePin);
                    }

                    if (
                        srcNode.Config != null
                        && srcNode.Config.RootElement.ValueKind == JsonValueKind.Object
                    )
                    {
                        foreach (
                            var prop in new[] { "key", "VariableName", "name", "target", "id" }
                        )
                        {
                            if (
                                srcNode.Config.RootElement.TryGetProperty(prop, out var p)
                                && p.GetString() is { } s
                                && !string.IsNullOrWhiteSpace(s)
                            )
                            {
                                candidateKeys.Add(s);
                            }
                        }
                    }

                    if (
                        srcNode.Metadata != null
                        && srcNode.Metadata.RootElement.ValueKind == JsonValueKind.Object
                    )
                    {
                        foreach (var prop in new[] { "key", "VariableName", "name", "label" })
                        {
                            if (
                                srcNode.Metadata.RootElement.TryGetProperty(prop, out var p)
                                && p.GetString() is { } s
                                && !string.IsNullOrWhiteSpace(s)
                            )
                            {
                                candidateKeys.Add(s);
                            }
                        }
                    }

                    // 1. Đối chiếu candidate keys với RuntimeInputs
                    if (runtimeInputs != null)
                    {
                        foreach (var candidate in candidateKeys)
                        {
                            var candNorm = CanonicalPinKey.Normalize(candidate);
                            foreach (var (k, v) in runtimeInputs)
                            {
                                if (CanonicalPinKey.IsMatching(k, candNorm) && v != null)
                                {
                                    var (_, parsedGuid, isValid) = EntityRefHelper.Parse(v);
                                    if (isValid && parsedGuid != Guid.Empty)
                                    {
                                        effectiveRunnerId = parsedGuid;
                                        break;
                                    }
                                }
                            }
                            if (effectiveRunnerId.HasValue && effectiveRunnerId.Value != Guid.Empty)
                                break;
                        }

                        // Nếu node nguồn liên quan đến Runner (RefId / Category chứa Runner/Agent), tìm fallback trong runtimeInputs
                        if (
                            (!effectiveRunnerId.HasValue || effectiveRunnerId.Value == Guid.Empty)
                            && (
                                srcNode.RefId.Contains("Runner", StringComparison.OrdinalIgnoreCase)
                                || srcNode.RefId.Contains(
                                    "Agent",
                                    StringComparison.OrdinalIgnoreCase
                                )
                                || candidateKeys.Any(c =>
                                    c.Contains("runner", StringComparison.OrdinalIgnoreCase)
                                    || c.Contains("agent", StringComparison.OrdinalIgnoreCase)
                                )
                            )
                        )
                        {
                            foreach (var (k, v) in runtimeInputs)
                            {
                                if (
                                    (
                                        k.Contains("runner", StringComparison.OrdinalIgnoreCase)
                                        || k.Contains("agent", StringComparison.OrdinalIgnoreCase)
                                    )
                                    && v != null
                                )
                                {
                                    var (_, parsedGuid, isValid) = EntityRefHelper.Parse(v);
                                    if (isValid && parsedGuid != Guid.Empty)
                                    {
                                        effectiveRunnerId = parsedGuid;
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    // 2. Thử lấy từ DefaultValue của Pipeline Parameters nếu chưa tìm thấy
                    if (!effectiveRunnerId.HasValue || effectiveRunnerId.Value == Guid.Empty)
                    {
                        foreach (var candidate in candidateKeys)
                        {
                            var param = pipeline.Parameters.FirstOrDefault(p =>
                                CanonicalPinKey.IsMatching(p.Key, candidate)
                                || CanonicalPinKey.IsMatching(p.Label, candidate)
                                || p.Id.ToString()
                                    .Equals(candidate, StringComparison.OrdinalIgnoreCase)
                            );

                            if (param?.DefaultValue != null)
                            {
                                var (_, parsedGuid, isValid) = EntityRefHelper.Parse(
                                    param.DefaultValue
                                );
                                if (isValid && parsedGuid != Guid.Empty)
                                {
                                    effectiveRunnerId = parsedGuid;
                                    break;
                                }
                            }
                        }
                    }

                    // 3. Thử lấy từ DefaultValue của Pipeline Variables nếu chưa tìm thấy
                    if (!effectiveRunnerId.HasValue || effectiveRunnerId.Value == Guid.Empty)
                    {
                        foreach (var candidate in candidateKeys)
                        {
                            var variable = pipeline.Parameters.FirstOrDefault(v =>
                                v.Kind == PipelineParameterKind.Variable
                                && (
                                    CanonicalPinKey.IsMatching(v.Key, candidate)
                                    || CanonicalPinKey.IsMatching(v.Label, candidate)
                                )
                            );

                            if (variable?.DefaultValue != null)
                            {
                                var (_, parsedGuid, isValid) = EntityRefHelper.Parse(
                                    variable.DefaultValue
                                );
                                if (isValid && parsedGuid != Guid.Empty)
                                {
                                    effectiveRunnerId = parsedGuid;
                                    break;
                                }
                            }
                        }
                    }

                    // 4. Thử trích xuất từ Config của Node nguồn (runnerId, targetRunnerId)
                    if (!effectiveRunnerId.HasValue || effectiveRunnerId.Value == Guid.Empty)
                    {
                        if (
                            srcNode.Config != null
                            && srcNode.Config.RootElement.ValueKind == JsonValueKind.Object
                        )
                        {
                            foreach (
                                var prop in new[]
                                {
                                    "runnerId",
                                    "RunnerId",
                                    "targetRunnerId",
                                    "TargetRunnerId",
                                    "value",
                                }
                            )
                            {
                                if (
                                    srcNode.Config.RootElement.TryGetProperty(prop, out var rProp)
                                    && rProp.GetString() is { } rStr
                                )
                                {
                                    var (_, parsedGuid, isValid) = EntityRefHelper.Parse(rStr);
                                    if (isValid && parsedGuid != Guid.Empty)
                                    {
                                        effectiveRunnerId = parsedGuid;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 5. Ultimate Fallback: Nếu Stage chưa có Runner mà RuntimeInputs có Runner (từ modal run), tự động gắn vào Stage
            if (
                (!effectiveRunnerId.HasValue || effectiveRunnerId.Value == Guid.Empty)
                && runtimeInputs != null
            )
            {
                foreach (var (k, v) in runtimeInputs)
                {
                    if (
                        (
                            k.Equals("Runner", StringComparison.OrdinalIgnoreCase)
                            || k.Equals("runner", StringComparison.OrdinalIgnoreCase)
                            || k.Equals("targetRunnerId", StringComparison.OrdinalIgnoreCase)
                        )
                        && v != null
                    )
                    {
                        var (_, parsedGuid, isValid) = EntityRefHelper.Parse(v);
                        if (isValid && parsedGuid != Guid.Empty)
                        {
                            effectiveRunnerId = parsedGuid;
                            break;
                        }
                    }
                }
            }

            var queueName =
                effectiveRunnerId.HasValue && effectiveRunnerId.Value != Guid.Empty
                    ? $"stage_tasks.{effectiveRunnerId.Value}"
                    : string.Empty;

            stageBindings[container.Id] = new StageWorkerBinding
            {
                StageId = container.Id,
                StageName = containerName,
                Executor = containerExecutor,
                ConfiguredRunnerId = configuredRunnerId,
                BoundSourceNodeId = boundSrcNodeId,
                BoundSourcePin = boundSrcPin,
                EffectiveRunnerId = effectiveRunnerId,
                BindingSource = bindingSource,
                TargetQueueName = queueName,
                IsValid = true,
            };
        }

        var startNode = pipeline.Nodes.FirstOrDefault(n =>
            n.ParentId == null
            && (
                n.Kind == PipelineNodeKind.Start
                || n.RefId.Equals("Start", StringComparison.OrdinalIgnoreCase)
            )
        );

        var returnNode = pipeline.Nodes.FirstOrDefault(n =>
            n.ParentId == null
            && (
                n.Kind == PipelineNodeKind.Return
                || n.RefId.Equals("Return", StringComparison.OrdinalIgnoreCase)
            )
        );

        return new FrozenExecutionGraph
        {
            PipelineId = pipeline.Id,
            ProjectId = pipeline.ProjectId,
            NodesById = nodesById,
            ParametersByKey = paramsDict,
            Edges = pipeline.Edges,
            InEdges = inEdges,
            InEdgesByTargetNode = inByTarget.ToDictionary(
                k => k.Key,
                k => (IReadOnlyList<PipelineEdge>)k.Value
            ),
            OutEdges = outEdges.ToDictionary(k => k.Key, k => (IReadOnlyList<PipelineEdge>)k.Value),
            StageBindings = stageBindings,
            PureNodeIds = pureIds,
            DynamicPureNodeIds = dynamicNodes,
            StartNode = startNode,
            ReturnNode = returnNode,
        };
    }
}
