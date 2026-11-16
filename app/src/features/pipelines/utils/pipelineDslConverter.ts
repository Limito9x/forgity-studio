import { dump, load } from "js-yaml";
import type { Node, Edge } from "@xyflow/react";

export interface PipelineDslNode {
  id: string;
  tool: string;
  label?: string;
  category?: string;
  executor?: string;
  stage?: string;
  inputs?: Record<string, any>;
  metadata?: Record<string, any>;
  isBatch?: boolean;
  maxConcurrency?: number;
  iterablePin?: string;
  skipOnError?: boolean;
}

export interface PipelineDslEdge {
  from: string;
  to: string;
}

export interface PipelineDslDocument {
  name: string;
  version?: string;
  runner?: string;
  description?: string;
  nodes: PipelineDslNode[];
  edges?: PipelineDslEdge[];
}

/**
 * Chuyển đổi từ ReactFlow Visual Graph sang Declarative YAML DSL
 */
export function graphToPipelineYaml(
  pipelineName: string,
  nodes: any[],
  edges: any[],
  description?: string,
  kind?: "master" | "component",
  executor?: string
): string {
  const dslNodes: PipelineDslNode[] = [];

  for (const n of nodes) {
    if (n.type === "scopeContainer") continue; // Stage scopes are mapped via node.stage

    // Hỗ trợ cả ReactFlow Node (n.data) lẫn ExtendedPipelineGraphDto Node (phẳng)
    const data = n.data && typeof n.data === "object" ? n.data : n;
    const refId =
      (data.refId as string) ||
      (n.refId as string) ||
      (data.key as string) ||
      (n.key as string) ||
      n.id;
    const refIdLower = String(refId).toLowerCase();
    const isControlNode =
      refIdLower === "start" ||
      refIdLower === "beginexecute" ||
      refIdLower === "return" ||
      refIdLower === "endexecute";

    const rawInputsConfig: Record<string, any> =
      (data.configValues as Record<string, any>) ||
      (n.configValues as Record<string, any>) ||
      {};
    const isBatch = Boolean(rawInputsConfig._isBatch);
    const maxConcurrency = isBatch && rawInputsConfig._maxConcurrency != null
      ? Number(rawInputsConfig._maxConcurrency)
      : undefined;
    const iterablePin = isBatch && rawInputsConfig._iterablePin
      ? String(rawInputsConfig._iterablePin)
      : undefined;
    const skipOnError = isBatch && rawInputsConfig._skipOnError !== undefined
      ? Boolean(rawInputsConfig._skipOnError)
      : undefined;

    const inputsConfig: Record<string, any> = {};
    for (const [k, v] of Object.entries(rawInputsConfig)) {
      if (k === "_isBatch" || k === "_maxConcurrency" || k === "_iterablePin" || k === "_skipOnError") {
        continue;
      }
      inputsConfig[k] = v;
    }

    const label = (data.label as string) || (n.label as string) || undefined;
    const category = (data.category as string) || (n.category as string) || undefined;
    const executor = (data.executor as string) || (n.executor as string) || undefined;
    const isLocalDraft = Boolean(data.isLocalDraft ?? n.metadata?.isLocalDraft);
    const sourcePath = data.sourcePath ?? n.metadata?.sourcePath;

    dslNodes.push({
      id: n.id,
      tool: refId,
      label,
      category: isControlNode ? undefined : category,
      executor: isControlNode ? undefined : executor,
      stage: (n.parentId as string) || undefined,
      inputs: Object.keys(inputsConfig).length > 0 ? inputsConfig : undefined,
      metadata: isLocalDraft ? { isLocalDraft: true, sourcePath } : undefined,
      ...(isBatch
        ? {
            isBatch: true,
            maxConcurrency,
            iterablePin,
            skipOnError,
          }
        : {}),
    });
  }

  const dslEdges: PipelineDslEdge[] = (edges || [])
    .map((e: any) => {
      const src = e.source || e.sourceNodeId;
      const srcPin = e.sourceHandle || e.sourcePin || "out";
      const dst = e.target || e.targetNodeId;
      const dstPin = e.targetHandle || e.targetPin || "in";
      if (!src || !dst) return null;
      return {
        from: `${src}.${srcPin}`,
        to: `${dst}.${dstPin}`,
      };
    })
    .filter((x): x is PipelineDslEdge => x !== null);

  const doc: PipelineDslDocument & { kind?: string; executor?: string } = {
    name: pipelineName || "Draft Pipeline",
    version: "draft",
    runner: "local",
    ...(kind ? { kind } : {}),
    ...(kind === "component" && executor ? { executor } : {}),
    description: description || undefined,
    nodes: dslNodes,
    edges: dslEdges.length > 0 ? dslEdges : undefined,
  };

  return dump(doc, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
  });
}

/**
 * Phân tích file Declarative YAML DSL thành cấu trúc nodes & edges
 */
export function pipelineYamlToGraph(yamlContent: string): {
  name: string;
  description?: string;
  nodes: Node[];
  edges: Edge[];
} {
  const parsed = load(yamlContent) as PipelineDslDocument;
  if (!parsed || !parsed.nodes) {
    throw new Error("Invalid pipeline YAML: missing 'nodes' root property");
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Auto layout position tracking
  let currentX = 100;
  let currentY = 150;

  for (const item of parsed.nodes) {
    const isStart = item.id.toLowerCase() === "start" || item.tool.toLowerCase() === "start";
    const isReturn = item.id.toLowerCase() === "return" || item.tool.toLowerCase() === "return";

    let nodePos = { x: currentX, y: currentY };
    if (isStart) {
      nodePos = { x: 100, y: 150 };
    } else if (isReturn && parsed.nodes.length <= 2) {
      nodePos = { x: 700, y: 150 };
    }

    nodes.push({
      id: item.id,
      type: "pipelineNode",
      position: nodePos,
      parentId: item.stage,
      data: {
        id: item.id,
        refId: item.tool,
        label: item.label || item.tool,
        category: item.category,
        executor: item.executor,
        configValues: {
          ...(item.inputs || {}),
          ...(item.isBatch
            ? {
                _isBatch: true,
                _maxConcurrency: item.maxConcurrency ?? 2,
                _iterablePin: item.iterablePin ?? "",
                _skipOnError: item.skipOnError ?? true,
              }
            : {}),
        },
        isLocalDraft: item.metadata?.isLocalDraft || item.tool.startsWith("local:"),
        sourcePath: item.metadata?.sourcePath,
      },
    });

    currentX += 300;
    if (currentX > 1200) {
      currentX = 100;
      currentY += 200;
    }
  }

  if (parsed.edges && Array.isArray(parsed.edges)) {
    for (const [idx, edge] of parsed.edges.entries()) {
      const [sourceId, sourceHandle] = (edge.from || "").split(".");
      const [targetId, targetHandle] = (edge.to || "").split(".");

      if (sourceId && targetId) {
        edges.push({
          id: `e-${sourceId}-${targetId}-${idx}`,
          source: sourceId,
          target: targetId,
          sourceHandle: sourceHandle || "out",
          targetHandle: targetHandle || "in",
          animated: true,
          type: "smoothstep",
        });
      }
    }
  }

  return {
    name: parsed.name || "Imported Pipeline",
    description: parsed.description,
    nodes,
    edges,
  };
}

