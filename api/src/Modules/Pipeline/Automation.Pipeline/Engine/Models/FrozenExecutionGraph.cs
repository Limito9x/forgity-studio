using System.Text.Json;
using Automation.Pipeline.Constants;
using Automation.Pipeline.Engine.Analysis;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
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

    public IReadOnlyDictionary<Guid, PipelineNode> NodesById { get; init; } = new Dictionary<Guid, PipelineNode>();
    public IReadOnlyDictionary<string, PipelineParameter> ParametersByKey { get; init; } = new Dictionary<string, PipelineParameter>(StringComparer.OrdinalIgnoreCase);
    public IReadOnlyList<PipelineEdge> Edges { get; init; } = [];

    // Tra cứu dây nối vào 1 chân pin cụ thể của 1 node O(1)
    public IReadOnlyDictionary<(Guid TargetNodeId, string CanonicalPin), PipelineEdge> InEdges { get; init; }
        = new Dictionary<(Guid TargetNodeId, string CanonicalPin), PipelineEdge>();

    // Tra cứu tất cả dây nối vào 1 node O(1)
    public IReadOnlyDictionary<Guid, IReadOnlyList<PipelineEdge>> InEdgesByTargetNode { get; init; }
        = new Dictionary<Guid, IReadOnlyList<PipelineEdge>>();

    // Tra cứu các dây nối từ 1 chân pin ra ngoài O(1)
    public IReadOnlyDictionary<(Guid SourceNodeId, string CanonicalPin), IReadOnlyList<PipelineEdge>> OutEdges { get; init; }
        = new Dictionary<(Guid SourceNodeId, string CanonicalPin), IReadOnlyList<PipelineEdge>>();

    // Bản đồ Stage -> Worker Executor -> Runner máy trạm (Hỗ trợ Plug over Select)
    public IReadOnlyDictionary<Guid, StageWorkerBinding> StageBindings { get; init; }
        = new Dictionary<Guid, StageWorkerBinding>();

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
        var paramsDict = new Dictionary<string, PipelineParameter>(StringComparer.OrdinalIgnoreCase);
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
        var outEdges = new Dictionary<(Guid SourceNodeId, string CanonicalPin), List<PipelineEdge>>();

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
        var containerNodes = pipeline.Nodes
            .Where(n => n.Kind == PipelineNodeKind.Container)
            .ToList();

        foreach (var container in containerNodes)
        {
            var containerExecutor = "dotNet";
            Guid? configuredRunnerId = null;

            if (container.Metadata != null && container.Metadata.RootElement.ValueKind == JsonValueKind.Object)
            {
                if (container.Metadata.RootElement.TryGetProperty("executor", out var execProp))
                    containerExecutor = execProp.GetString() ?? "dotNet";
                else if (container.Metadata.RootElement.TryGetProperty("executorKey", out var execKeyProp))
                    containerExecutor = execKeyProp.GetString() ?? "dotNet";

                if (container.Metadata.RootElement.TryGetProperty("targetRunnerId", out var runnerProp) &&
                    runnerProp.GetString() is { } runnerStr &&
                    Guid.TryParse(runnerStr, out var parsedRunnerId))
                {
                    configuredRunnerId = parsedRunnerId;
                }
            }

            var containerName = container.RefId;
            if (container.Config != null && container.Config.RootElement.ValueKind == JsonValueKind.Object &&
                container.Config.RootElement.TryGetProperty("label", out var labelProp))
            {
                containerName = labelProp.GetString() ?? containerName;
            }

            // Quét xem có dây nối nào cắm vào cổng "runner" của Container không (Plug over Select)
            (Guid TargetNodeId, string CanonicalPin) runnerEdgeKey = (container.Id, CanonicalPinKey.Normalize("runner"));
            PipelineEdge? incomingRunnerEdge = inEdges.TryGetValue(runnerEdgeKey, out var foundEdge) ? foundEdge : null;

            // Nếu không tìm thấy bằng "runner", thử tìm bằng "runnerid"
            if (incomingRunnerEdge == null)
            {
                (Guid TargetNodeId, string CanonicalPin) altKey = (container.Id, CanonicalPinKey.Normalize("runnerid"));
                if (inEdges.TryGetValue(altKey, out var altFound))
                {
                    incomingRunnerEdge = altFound;
                }
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
                    if (srcNode.Kind == PipelineNodeKind.Start || srcNode.RefId.Equals("Start", StringComparison.OrdinalIgnoreCase))
                    {
                        // Lấy từ RuntimeInputs truyền vào khi bấm Run
                        if (runtimeInputs != null)
                        {
                            var pinNorm = CanonicalPinKey.Normalize(incomingRunnerEdge.SourcePin);
                            foreach (var (k, v) in runtimeInputs)
                            {
                                if (CanonicalPinKey.IsMatching(k, pinNorm) && v != null)
                                {
                                    if (Guid.TryParse(v.ToString(), out var parsedGuid))
                                    {
                                        effectiveRunnerId = parsedGuid;
                                    }
                                    break;
                                }
                            }
                        }
                    }
                    else if (srcNode.Kind == PipelineNodeKind.Variable)
                    {
                        // Variable Capsule: giải quyết lúc runtime nếu chưa có
                    }
                    else
                    {
                        // Nguồn là một Node cố định: thử trích xuất runnerId từ Config
                        if (srcNode.Config != null && srcNode.Config.RootElement.ValueKind == JsonValueKind.Object)
                        {
                            if (srcNode.Config.RootElement.TryGetProperty("runnerId", out var rProp) &&
                                Guid.TryParse(rProp.GetString(), out var rGuid))
                            {
                                effectiveRunnerId = rGuid;
                            }
                        }
                    }
                }
            }

            var queueName = effectiveRunnerId.HasValue && effectiveRunnerId.Value != Guid.Empty
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
                IsValid = true
            };
        }

        var startNode = pipeline.Nodes.FirstOrDefault(n =>
            n.ParentId == null && (n.Kind == PipelineNodeKind.Start || n.RefId.Equals("Start", StringComparison.OrdinalIgnoreCase)));

        var returnNode = pipeline.Nodes.FirstOrDefault(n =>
            n.ParentId == null && (n.Kind == PipelineNodeKind.Return || n.RefId.Equals("Return", StringComparison.OrdinalIgnoreCase)));

        return new FrozenExecutionGraph
        {
            PipelineId = pipeline.Id,
            ProjectId = pipeline.ProjectId,
            NodesById = nodesById,
            ParametersByKey = paramsDict,
            Edges = pipeline.Edges,
            InEdges = inEdges,
            InEdgesByTargetNode = inByTarget.ToDictionary(k => k.Key, k => (IReadOnlyList<PipelineEdge>)k.Value),
            OutEdges = outEdges.ToDictionary(k => k.Key, k => (IReadOnlyList<PipelineEdge>)k.Value),
            StageBindings = stageBindings,
            PureNodeIds = pureIds,
            DynamicPureNodeIds = dynamicNodes,
            StartNode = startNode,
            ReturnNode = returnNode
        };
    }
}
