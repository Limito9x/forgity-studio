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
  nodes: Node[],
  edges: Edge[],
  description?: string
): string {
  const dslNodes: PipelineDslNode[] = [];

  for (const n of nodes) {
    if (n.type === "scopeContainer") continue; // Stage scopes are mapped via node.stage

    const data = n.data || {};
    const refId = (data.refId as string) || (data.key as string) || n.id;
    const refIdLower = refId.toLowerCase();
    const isControlNode =
      refIdLower === "start" ||
      refIdLower === "beginexecute" ||
      refIdLower === "return" ||
      refIdLower === "endexecute";

    const inputsConfig: Record<string, any> = (data.configValues as Record<string, any>) || {};

    dslNodes.push({
      id: n.id,
      tool: refId,
      label: (data.label as string) || undefined,
      category: isControlNode ? undefined : (data.category as string) || undefined,
      executor: isControlNode ? undefined : (data.executor as string) || undefined,
      stage: (n.parentId as string) || undefined,
      inputs: Object.keys(inputsConfig).length > 0 ? inputsConfig : undefined,
      metadata: data.isLocalDraft ? { isLocalDraft: true, sourcePath: data.sourcePath } : undefined,
    });
  }

  const dslEdges: PipelineDslEdge[] = edges.map((e) => ({
    from: `${e.source}.${e.sourceHandle || "out"}`,
    to: `${e.target}.${e.targetHandle || "in"}`,
  }));

  const doc: PipelineDslDocument = {
    name: pipelineName || "Draft Pipeline",
    version: "draft",
    runner: "local",
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
  let currentY = 100;

  for (const item of parsed.nodes) {
    nodes.push({
      id: item.id,
      type: "pipelineNode",
      position: { x: currentX, y: currentY },
      parentId: item.stage,
      data: {
        id: item.id,
        refId: item.tool,
        label: item.label || item.tool,
        category: item.category,
        executor: item.executor,
        configValues: item.inputs || {},
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

