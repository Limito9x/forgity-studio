using Automation.Pipeline.Constants;
using Automation.Pipeline.Contracts.NodeContract;
using Automation.Pipeline.Domain.Entities;
using Automation.Pipeline.Domain.Enums;
using Automation.Pipeline.Domain.ValueObjects;
using Automation.Pipeline.Contracts.StructRegistry;
namespace Automation.Pipeline.Contracts.Validation;

public class PipelineContractValidator(
    INodeContractResolver contractResolver,
    IEntityStructRegistry structRegistry
) : IPipelineContractValidator
{
    public async Task<PipelineContractValidationResult> ValidateGraphAsync(
        Domain.Entities.Pipeline pipeline,
        NodeContractResolutionContext? prebuiltContext = null,
        IReadOnlyDictionary<Guid, ResolvedNodeContract>? prebuiltContracts = null,
        CancellationToken ct = default
    )
    {
        var diagnostics = new List<PipelineDiagnostic>();
        var cycleNodeIds = new List<string>();
        var unresolvedPins = new List<UnresolvedPinError>();

        var context = prebuiltContext ?? await contractResolver.BuildContextAsync(pipeline, ct);
        var contracts = prebuiltContracts ?? contractResolver.ResolveAllNodes(pipeline.Nodes, context);

        var nodesById = pipeline.Nodes.ToDictionary(n => n.Id);
        var inEdgesByTarget = pipeline.Edges
            .GroupBy(e => (e.TargetPipelineNodeId, e.TargetPin.Trim().ToLowerInvariant()))
            .ToDictionary(g => g.Key, g => g.First());

        var outEdgesBySource = pipeline.Edges
            .GroupBy(e => (e.SourcePipelineNodeId, e.SourcePin.Trim().ToLowerInvariant()))
            .ToDictionary(g => g.Key, g => g.ToList());

        // 1. Kiểm tra từng Node theo ResolvedNodeContract
        foreach (var (nodeId, contract) in contracts)
        {
            if (contract.IsDefinitionMissing)
            {
                diagnostics.Add(new PipelineDiagnostic(
                    PipelineDiagnosticCode.MissingNodeDefinition,
                    PipelineDiagnosticSeverity.Error,
                    contract.MissingReason ?? $"Definition for node '{contract.Label}' could not be resolved.",
                    NodeId: nodeId,
                    NodeLabel: contract.Label
                ));
            }

            // 1a. Kiểm tra Struct nodes đã chọn StructType chưa
            if (contract.Capabilities?.InspectorMode == "StructSelector" ||
                contract.Capabilities?.ViewVariant == "Struct" ||
                contract.RefId is "BreakStruct" or "MakeStruct" or "CastToStruct")
            {
                var structType = contract.ConfigValues?.GetValueOrDefault("StructType")?.ToString();
                if (string.IsNullOrWhiteSpace(structType) || structRegistry.Get(structType) == null)
                {
                    diagnostics.Add(new PipelineDiagnostic(
                        PipelineDiagnosticCode.UnselectedStructSchema,
                        PipelineDiagnosticSeverity.Error,
                        $"Node '{contract.Label}' requires a valid StructType selected in Inspector.",
                        NodeId: nodeId,
                        NodeLabel: contract.Label
                    ));
                }
            }

            // 1b. Kiểm tra Unresolved Required Inputs
            foreach (var inputPin in contract.Inputs.Where(p => p.Kind == PinKind.Data && p.IsRequired))
            {
                var pinKey = (nodeId, inputPin.Id.Trim().ToLowerInvariant());
                var hasIncomingWire = inEdgesByTarget.ContainsKey(pinKey);

                var hasConfigValue = false;
                var isUnboundFile = false;
                string? unboundFileName = null;

                if (contract.ConfigValues != null && contract.ConfigValues.TryGetValue(inputPin.Id, out var val) && val != null)
                {
                    if (Automation.Pipeline.Runtime.State.PipelineFileValue.TryGetUnbound(val, out var unboundInfo))
                    {
                        isUnboundFile = true;
                        unboundFileName = unboundInfo?.OriginalFileName;
                        hasConfigValue = false;
                    }
                    else if (val is string s)
                    {
                        hasConfigValue = !string.IsNullOrWhiteSpace(s);
                    }
                    else
                    {
                        hasConfigValue = true;
                    }
                }

                var hasDefaultValue = inputPin.DefaultValue != null;

                if (isUnboundFile)
                {
                    var msg = $"File '{unboundFileName ?? inputPin.Label}' on pin '{inputPin.Label}' of node '{contract.Label}' is missing from storage (unbound). Please upload a replacement file.";
                    diagnostics.Add(new PipelineDiagnostic(
                        PipelineDiagnosticCode.UnresolvedRequiredPin,
                        inputPin.IsRequired ? PipelineDiagnosticSeverity.Error : PipelineDiagnosticSeverity.Warning,
                        msg,
                        NodeId: nodeId,
                        NodeLabel: contract.Label,
                        PinId: inputPin.Id
                    ));

                    if (inputPin.IsRequired)
                    {
                        unresolvedPins.Add(new UnresolvedPinError(
                            nodeId.ToString(),
                            contract.Label,
                            inputPin.Id,
                            inputPin.PrimitiveType.ToString()
                        ));
                    }
                }
                else if (!hasIncomingWire && !hasConfigValue && !hasDefaultValue)
                {
                    diagnostics.Add(new PipelineDiagnostic(
                        PipelineDiagnosticCode.UnresolvedRequiredPin,
                        PipelineDiagnosticSeverity.Error,
                        $"Required input pin '{inputPin.Label}' on node '{contract.Label}' has no incoming connection and no configured value.",
                        NodeId: nodeId,
                        NodeLabel: contract.Label,
                        PinId: inputPin.Id
                    ));

                    unresolvedPins.Add(new UnresolvedPinError(
                        nodeId.ToString(),
                        contract.Label,
                        inputPin.Id,
                        inputPin.PrimitiveType.ToString()
                    ));
                }
            }
        }

        // 2. Kiểm tra tính toàn vẹn và tương thích của từng Edge
        foreach (var edge in pipeline.Edges)
        {
            if (!contracts.TryGetValue(edge.SourcePipelineNodeId, out var srcContract))
            {
                diagnostics.Add(new PipelineDiagnostic(
                    PipelineDiagnosticCode.DanglingEdgePin,
                    PipelineDiagnosticSeverity.Error,
                    $"Edge '{edge.Id}' connects from non-existent source node '{edge.SourcePipelineNodeId}'.",
                    EdgeId: edge.Id
                ));
                continue;
            }

            if (!contracts.TryGetValue(edge.TargetPipelineNodeId, out var tgtContract))
            {
                diagnostics.Add(new PipelineDiagnostic(
                    PipelineDiagnosticCode.DanglingEdgePin,
                    PipelineDiagnosticSeverity.Error,
                    $"Edge '{edge.Id}' connects to non-existent target node '{edge.TargetPipelineNodeId}'.",
                    EdgeId: edge.Id
                ));
                continue;
            }

            var srcPin = srcContract.Outputs.FirstOrDefault(p =>
                string.Equals(p.Id, edge.SourcePin, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(p.Label, edge.SourcePin, StringComparison.OrdinalIgnoreCase));

            var tgtPin = tgtContract.Inputs.FirstOrDefault(p =>
                string.Equals(p.Id, edge.TargetPin, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(p.Label, edge.TargetPin, StringComparison.OrdinalIgnoreCase));

            if (srcPin == null)
            {
                diagnostics.Add(new PipelineDiagnostic(
                    PipelineDiagnosticCode.DanglingEdgePin,
                    PipelineDiagnosticSeverity.Error,
                    $"Edge '{edge.Id}' connects from pin '{edge.SourcePin}' which does not exist on source node '{srcContract.Label}'.",
                    NodeId: srcContract.NodeId,
                    NodeLabel: srcContract.Label,
                    PinId: edge.SourcePin,
                    EdgeId: edge.Id
                ));
                continue;
            }

            if (tgtPin == null)
            {
                diagnostics.Add(new PipelineDiagnostic(
                    PipelineDiagnosticCode.DanglingEdgePin,
                    PipelineDiagnosticSeverity.Error,
                    $"Edge '{edge.Id}' connects to pin '{edge.TargetPin}' which does not exist on target node '{tgtContract.Label}'.",
                    NodeId: tgtContract.NodeId,
                    NodeLabel: tgtContract.Label,
                    PinId: edge.TargetPin,
                    EdgeId: edge.Id
                ));
                continue;
            }

            // Kiểm tra tương thích Exec vs Data
            if (srcPin.Kind != tgtPin.Kind)
            {
                diagnostics.Add(new PipelineDiagnostic(
                    PipelineDiagnosticCode.IncompatiblePinType,
                    PipelineDiagnosticSeverity.Error,
                    $"Edge '{edge.Id}' attempts to connect {srcPin.Kind} pin '{srcPin.Id}' to {tgtPin.Kind} pin '{tgtPin.Id}'.",
                    EdgeId: edge.Id
                ));
                continue;
            }

            // Kiểm tra tương thích kiểu dữ liệu (Data Pins)
            if (srcPin.Kind == PinKind.Data)
            {
                var allowsFlexibleCardinality =
                    tgtContract.Capabilities?.ViewVariant == "Collection" ||
                    tgtContract.Capabilities?.InspectorMode == "FormatTemplate" ||
                    tgtContract.RefId is "MakeArray" or "FormatString" or "GetArrayItem";

                // Kiểm tra Cardinality
                if (srcPin.Cardinality != tgtPin.Cardinality && !allowsFlexibleCardinality)
                {
                    diagnostics.Add(new PipelineDiagnostic(
                        PipelineDiagnosticCode.IncompatiblePinType,
                        PipelineDiagnosticSeverity.Error,
                        $"Cardinality mismatch on edge '{edge.Id}': Source '{srcPin.Id}' is {srcPin.Cardinality} but Target '{tgtPin.Id}' expects {tgtPin.Cardinality}.",
                        EdgeId: edge.Id
                    ));
                    continue;
                }

                var allowsFlexibleType =
                    tgtContract.Capabilities?.InspectorMode == "FormatTemplate" ||
                    tgtContract.RefId is "FormatString" or "GetByPath";

                // Kiểm tra Primitive Type
                if (srcPin.PrimitiveType != tgtPin.PrimitiveType && !allowsFlexibleType)
                {
                    diagnostics.Add(new PipelineDiagnostic(
                        PipelineDiagnosticCode.IncompatiblePinType,
                        PipelineDiagnosticSeverity.Error,
                        $"Type mismatch on edge '{edge.Id}': Source '{srcPin.Id}' ({srcPin.PrimitiveType}) cannot connect to Target '{tgtPin.Id}' ({tgtPin.PrimitiveType}).",
                        EdgeId: edge.Id
                    ));
                    continue;
                }

                // Kiểm tra StructType của EntityRef
                if (srcPin.PrimitiveType == PinPrimitiveType.EntityRef &&
                    !string.IsNullOrWhiteSpace(srcPin.StructType) &&
                    !string.IsNullOrWhiteSpace(tgtPin.StructType) &&
                    !string.Equals(srcPin.StructType, tgtPin.StructType, StringComparison.OrdinalIgnoreCase))
                {
                    diagnostics.Add(new PipelineDiagnostic(
                        PipelineDiagnosticCode.IncompatiblePinType,
                        PipelineDiagnosticSeverity.Error,
                        $"StructType mismatch on edge '{edge.Id}': Source '{srcPin.Id}' has StructType '{srcPin.StructType}' while Target '{tgtPin.Id}' expects '{tgtPin.StructType}'.",
                        EdgeId: edge.Id
                    ));
                }
            }
        }

        // 3. Phát hiện chu trình (Cycle Detection)
        DetectCycles(pipeline, cycleNodeIds, diagnostics);

        // 4. Báo Warning cho Orphan Node (Node rời rạc hoàn toàn)
        foreach (var (nodeId, contract) in contracts)
        {
            if (contract.Kind is PipelineNodeKind.Start or PipelineNodeKind.Return or PipelineNodeKind.Container)
                continue;

            var hasAnyInEdge = pipeline.Edges.Any(e => e.TargetPipelineNodeId == nodeId);
            var hasAnyOutEdge = pipeline.Edges.Any(e => e.SourcePipelineNodeId == nodeId);

            if (!hasAnyInEdge && !hasAnyOutEdge)
            {
                diagnostics.Add(new PipelineDiagnostic(
                    PipelineDiagnosticCode.OrphanNode,
                    PipelineDiagnosticSeverity.Warning,
                    $"Node '{contract.Label}' is isolated with no incoming or outgoing connections.",
                    NodeId: nodeId,
                    NodeLabel: contract.Label
                ));
            }
        }

        var isValid = !diagnostics.Any(d => d.Severity == PipelineDiagnosticSeverity.Error);

        return new PipelineContractValidationResult(
            IsValid: isValid,
            Diagnostics: diagnostics,
            CycleNodeIds: cycleNodeIds,
            UnresolvedPins: unresolvedPins
        );
    }

    private static void DetectCycles(
        Domain.Entities.Pipeline pipeline,
        List<string> cycleNodeIds,
        List<PipelineDiagnostic> diagnostics)
    {
        var execEdges = pipeline.Edges
            .Where(e => e.Kind == EdgeKind.Exec ||
                        e.SourcePin.Contains("exec", StringComparison.OrdinalIgnoreCase) ||
                        e.SourcePin.Contains("body", StringComparison.OrdinalIgnoreCase) ||
                        e.TargetPin.Contains("exec", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var adj = new Dictionary<Guid, List<Guid>>();
        foreach (var edge in execEdges)
        {
            if (!adj.TryGetValue(edge.SourcePipelineNodeId, out var list))
            {
                list = [];
                adj[edge.SourcePipelineNodeId] = list;
            }
            list.Add(edge.TargetPipelineNodeId);
        }

        var visited = new HashSet<Guid>();
        var recursionStack = new HashSet<Guid>();

        foreach (var node in pipeline.Nodes)
        {
            if (!visited.Contains(node.Id))
            {
                if (DfsCheckCycle(node.Id, adj, visited, recursionStack, cycleNodeIds))
                {
                    diagnostics.Add(new PipelineDiagnostic(
                        PipelineDiagnosticCode.DagCycleDetected,
                        PipelineDiagnosticSeverity.Error,
                        "A cycle (infinite execution loop) was detected in the pipeline graph.",
                        NodeId: node.Id
                    ));
                    break;
                }
            }
        }
    }

    private static bool DfsCheckCycle(
        Guid current,
        Dictionary<Guid, List<Guid>> adj,
        HashSet<Guid> visited,
        HashSet<Guid> recursionStack,
        List<string> cycleNodeIds)
    {
        visited.Add(current);
        recursionStack.Add(current);

        if (adj.TryGetValue(current, out var neighbors))
        {
            foreach (var neighbor in neighbors)
            {
                if (!visited.Contains(neighbor))
                {
                    if (DfsCheckCycle(neighbor, adj, visited, recursionStack, cycleNodeIds))
                        return true;
                }
                else if (recursionStack.Contains(neighbor))
                {
                    cycleNodeIds.Add(neighbor.ToString());
                    return true;
                }
            }
        }

        recursionStack.Remove(current);
        return false;
    }
}
