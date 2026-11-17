import type { Edge, Node } from "@xyflow/react";
import type { PipelineValidationSummary } from "../context/PipelineWorkspaceContext";
import type { PipelineDiagnostic } from "../hooks/usePipelineGraph";

/**
 * Pure local structural validator for pipelines (Start node, DAG cycles, orphan nodes).
 */
export function validateLocalPipelineGraph(
  nodes: Node[],
  edges: Edge[]
): PipelineValidationSummary {
  const diagnostics: PipelineDiagnostic[] = [];

  const startNode = nodes.find((n) => {
    const kindStr = String((n.data as any)?.kind || "").toLowerCase();
    const refIdStr = String((n.data as any)?.refId || n.id).toLowerCase();
    return kindStr === "start" || refIdStr === "start";
  });

  if (!startNode) {
    diagnostics.push({
      code: "MissingNodeDefinition",
      severity: "Error",
      message: "Pipeline must have a Start node.",
    });
  }

  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.id, []));
  edges.forEach((e) => {
    if (adj.has(e.source)) adj.get(e.source)!.push(e.target);
  });

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycleNodeIds: string[] = [];

  const checkCycle = (curr: string) => {
    visited.add(curr);
    inStack.add(curr);
    for (const next of adj.get(curr) || []) {
      if (!visited.has(next)) {
        if (checkCycle(next)) return true;
      } else if (inStack.has(next)) {
        cycleNodeIds.push(next);
        diagnostics.push({
          code: "DagCycleDetected",
          severity: "Error",
          nodeId: next,
          message: "Loop/Cycle detected involving this node.",
        });
        return true;
      }
    }
    inStack.delete(curr);
    return false;
  };

  for (const n of nodes) {
    if (!visited.has(n.id)) checkCycle(n.id);
  }

  for (const n of nodes) {
    const kind = (n.data as any)?.kind;
    if (kind === "Start" || kind === "Capsule") continue;
    const inputs = ((n.data as any)?.inputs || []) as any[];
    const incomingEdges = edges.filter((e) => e.target === n.id);
    const hasExecIn = incomingEdges.some((e) =>
      (e.targetHandle || "").toLowerCase().includes("exec")
    );
    if (!hasExecIn && inputs.some((p) => p.kind === "Exec" || p.id === "exec_in")) {
      diagnostics.push({
        code: "OrphanNode",
        severity: "Warning",
        nodeId: n.id,
        message: "Execution input is not connected; node might not be reachable.",
      });
    }
  }

  return {
    isValid: diagnostics.every((d) => d.severity !== "Error"),
    diagnostics,
    cycleNodeIds,
  };
}
