import type {
  PinDefinition,
  PinDiffDto,
  ScriptImpactReportDto,
} from "../types/pipelineGraphTypes";
import type { ScannedPipelineYamlItemRust } from "../types/workspaceConfig";
import { pipelineYamlToGraph, graphToPipelineYaml } from "./pipelineDslConverter";

export interface ScriptPinDiffResult {
  inputPinDiffs: PinDiffDto[];
  outputPinDiffs: PinDiffDto[];
  breakingInputIds: Set<string>;
  breakingOutputIds: Set<string>;
}

function normalizeType(p: any): string {
  return String(p?.primitiveType || p?.dataType || "String").trim().toLowerCase();
}

function normalizeCardinality(p: any): string {
  return String(p?.cardinality || "Single").trim().toLowerCase();
}

function diffPinLists(oldPins: any[], newPins: any[]): { diffs: PinDiffDto[]; breakingIds: Set<string> } {
  const oldMap = new Map<string, any>();
  for (const p of oldPins || []) {
    const id = String(p?.id || p?.name || "");
    if (id) oldMap.set(id, p);
  }

  const newMap = new Map<string, any>();
  for (const p of newPins || []) {
    const id = String(p?.id || p?.name || "");
    if (id) newMap.set(id, p);
  }

  const diffs: PinDiffDto[] = [];
  const breakingIds = new Set<string>();

  for (const [id, newPin] of newMap.entries()) {
    const oldPin = oldMap.get(id);
    if (!oldPin) {
      diffs.push({
        pinId: id,
        label: newPin.label || id,
        primitiveType: newPin.primitiveType || newPin.dataType || "String",
        diffKind: "Added",
      });
    } else if (
      normalizeType(oldPin) !== normalizeType(newPin) ||
      normalizeCardinality(oldPin) !== normalizeCardinality(newPin)
    ) {
      diffs.push({
        pinId: id,
        label: newPin.label || id,
        primitiveType: newPin.primitiveType || newPin.dataType || "String",
        diffKind: "TypeChanged",
      });
      breakingIds.add(id);
    }
  }

  for (const [id, oldPin] of oldMap.entries()) {
    if (!newMap.has(id)) {
      diffs.push({
        pinId: id,
        label: oldPin.label || id,
        primitiveType: oldPin.primitiveType || oldPin.dataType || "String",
        diffKind: "Removed",
      });
      breakingIds.add(id);
    }
  }

  return { diffs, breakingIds };
}

export function computeScriptPinDiffs(
  oldInputs: any[] = [],
  oldOutputs: any[] = [],
  newInputs: any[] = [],
  newOutputs: any[] = [],
): ScriptPinDiffResult {
  const inDiff = diffPinLists(oldInputs, newInputs);
  const outDiff = diffPinLists(oldOutputs, newOutputs);
  return {
    inputPinDiffs: inDiff.diffs,
    outputPinDiffs: outDiff.diffs,
    breakingInputIds: inDiff.breakingIds,
    breakingOutputIds: outDiff.breakingIds,
  };
}

function matchesScriptKey(nodeRefId: string | undefined, scriptKey: string): boolean {
  if (!nodeRefId) return false;
  return nodeRefId === scriptKey || nodeRefId === `local:${scriptKey}`;
}

export function computeLocalScriptImpact(
  scriptKey: string,
  diffs: ScriptPinDiffResult,
  pipelines: ScannedPipelineYamlItemRust[],
): ScriptImpactReportDto {
  if (!pipelines || pipelines.length === 0) {
    return {
      affectedPipelineCount: 0,
      affectedNodeCount: 0,
      affectedEdgeCount: 0,
      affectedPipelineNames: [],
    };
  }

  let affectedNodeCount = 0;
  let affectedEdgeCount = 0;
  const affectedPipelineNames: string[] = [];

  for (const p of pipelines) {
    try {
      const graph = pipelineYamlToGraph(p.content, p.fullPath);
      const matchingNodeIds = new Set(
        (graph.nodes || [])
          .filter((n: any) => matchesScriptKey(n.refId, scriptKey))
          .map((n: any) => n.id),
      );
      if (matchingNodeIds.size === 0) continue;

      affectedNodeCount += matchingNodeIds.size;
      affectedPipelineNames.push(graph.name || p.fileName);

      for (const edge of graph.edges || []) {
        if (
          matchingNodeIds.has(edge.targetNodeId) &&
          diffs.breakingInputIds.has(edge.targetPin)
        ) {
          affectedEdgeCount++;
        } else if (
          matchingNodeIds.has(edge.sourceNodeId) &&
          diffs.breakingOutputIds.has(edge.sourcePin)
        ) {
          affectedEdgeCount++;
        }
      }
    } catch {
      // Ignore unparseable YAML files during impact scan
    }
  }

  return {
    affectedPipelineCount: affectedPipelineNames.length,
    affectedNodeCount,
    affectedEdgeCount,
    affectedPipelineNames,
  };
}

export interface ReconcileChange {
  scriptKey: string;
  strategy: number; // 0 = KeepCompatible, 1 = UnpinAll
  diffs: ScriptPinDiffResult;
  newInputs: PinDefinition[];
  newOutputs: PinDefinition[];
}

export async function reconcileLocalPipelines(
  changes: ReconcileChange[],
  pipelines: ScannedPipelineYamlItemRust[],
  savePipelineDraft: (params: { fullPath: string; content: string }) => Promise<unknown>,
): Promise<number> {
  if (changes.length === 0 || pipelines.length === 0) return 0;

  let updatedCount = 0;

  for (const p of pipelines) {
    try {
      const graph = pipelineYamlToGraph(p.content, p.fullPath);
      let modified = false;

      let nextNodes = [...(graph.nodes || [])];
      let nextEdges = [...(graph.edges || [])];

      for (const change of changes) {
        const matchingNodes = nextNodes.filter((n: any) =>
          matchesScriptKey(n.refId, change.scriptKey),
        );
        if (matchingNodes.length === 0) continue;

        const matchingIds = new Set(matchingNodes.map((n: any) => n.id));
        const beforeEdgeCount = nextEdges.length;

        if (change.strategy === 1) {
          // Unpin All Wires
          nextEdges = nextEdges.filter(
            (e: any) => !matchingIds.has(e.sourceNodeId) && !matchingIds.has(e.targetNodeId),
          );
        } else {
          // Keep Compatible Pins
          nextEdges = nextEdges.filter((e: any) => {
            if (matchingIds.has(e.targetNodeId) && change.diffs.breakingInputIds.has(e.targetPin)) {
              return false;
            }
            if (matchingIds.has(e.sourceNodeId) && change.diffs.breakingOutputIds.has(e.sourcePin)) {
              return false;
            }
            return true;
          });
        }

        if (nextEdges.length !== beforeEdgeCount) {
          modified = true;
        }
      }

      if (modified) {
        const nextYaml = graphToPipelineYaml(
          graph.name,
          nextNodes as any,
          nextEdges as any,
        );
        await savePipelineDraft({ fullPath: p.fullPath, content: nextYaml });
        updatedCount++;
      }
    } catch {
      // Ignore unparseable YAML files
    }
  }

  return updatedCount;
}
