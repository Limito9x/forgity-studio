import type { NodePaletteItemDto, PinDefinition } from "@/gen/model";

export const definitionKey = (kind: string, refId: string) => `${kind}:${refId.toLowerCase()}`;
export function indexDefinitions(items: NodePaletteItemDto[]) {
  const definitions = new Map<string, NodePaletteItemDto>();
  for (const item of items) {
    // 1. Index theo source (Tool, Custom, LocalDraft...)
    definitions.set(definitionKey(item.source, item.key), item);
    if (item.id) definitions.set(definitionKey(item.source, item.id), item);

    // 2. Index đa năng theo các kind phổ biến trong graph: LocalDraft, Custom, Tool
    definitions.set(definitionKey("LocalDraft", item.key), item);
    definitions.set(definitionKey("Custom", item.key), item);
    definitions.set(definitionKey("Tool", item.key), item);

    // 3. Hỗ trợ tìm kiếm theo cả key trần (không có tiền tố local:) lẫn có tiền tố local:
    if (item.key.startsWith("local:")) {
      const bareKey = item.key.slice("local:".length);
      definitions.set(definitionKey("LocalDraft", bareKey), item);
      definitions.set(definitionKey("Custom", bareKey), item);
      definitions.set(definitionKey("Tool", bareKey), item);
    } else {
      const prefixedKey = `local:${item.key}`;
      definitions.set(definitionKey("LocalDraft", prefixedKey), item);
      definitions.set(definitionKey("Custom", prefixedKey), item);
      definitions.set(definitionKey("Tool", prefixedKey), item);
    }
  }
  return definitions;
}
export function nodeView(kind: string, definition?: NodePaletteItemDto) {
  if (["Start", "Return", "FlowControl"].includes(kind)) return kind;
  if (!definition) return "Missing";
  if ((definition.capabilities as any)?.isConstantNode) return "Constant";
  const variant = definition.capabilities?.viewVariant;
  return variant === "Collection" || variant === "Struct" || variant === "Constant" ? variant : "Standard";
}

export function filterPalette(items: NodePaletteItemDto[], executor?: string) {
  return items.filter((item) => {
    if (!item.isVisibleInPalette) return false;
    if (!executor) return true;
    const exec = executor.toLowerCase();
    const itemExec = item.executor.toLowerCase();
    // Pure nodes (such as Make/Break local structs or pure math) are stage-agnostic and allowed everywhere
    if (itemExec === "pure") return true;
    if (exec === "macro") return item.source === "SubPipeline" || item.category === "Flow Control" || item.key === "Return";
    if (["server", "dotnet", "builtin"].includes(exec)) {
      if (item.source === "SubPipeline" || item.key === "Return" || item.category === "Flow Control") {
        return false;
      }
      return item.source === "Tool" || item.source === "BuiltIn" || ["builtin", "dotnet"].includes(item.executor.toLowerCase());
    }
    if (itemExec === exec) return true;
    // Allow generic Python scripts to run inside DCC stages (Unreal, Blender, Daz, etc.)
    if (itemExec === "python" && ["unreal", "blender", "daz", "python"].includes(exec)) return true;
    return false;
  });
}

/**
 * Computes a deterministic signature from only the schema-affecting config keys.
 * Changes to runtime data inputs (e.g. Target, Item_1, template variable values)
 * do not alter this signature and therefore do not trigger redundant pin resolutions.
 */
export function buildSchemaConfigSignature(
  configValues?: Record<string, unknown> | null,
  schemaConfigKeys?: readonly unknown[] | null
): string {
  const cfg = configValues || {};
  if (schemaConfigKeys && schemaConfigKeys.length > 0) {
    const picked: Record<string, unknown> = {};
    const entries = Object.entries(cfg);
    for (const rawKey of schemaConfigKeys) {
      if (typeof rawKey !== "string" || !rawKey) continue;
      const normalizedKey = rawKey.toLowerCase();
      const matched = entries.find(([k]) => k.toLowerCase() === normalizedKey);
      picked[rawKey] = matched ? (matched[1] ?? null) : null;
    }
    return JSON.stringify(picked);
  }
  return JSON.stringify(cfg);
}

export function arePinDefinitionsEqual(a?: PinDefinition, b?: PinDefinition): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    (a.id ?? "") === (b.id ?? "") &&
    (a.label ?? "") === (b.label ?? "") &&
    String(a.kind ?? "") === String(b.kind ?? "") &&
    String(a.primitiveType ?? "") === String(b.primitiveType ?? "") &&
    String(a.cardinality ?? "") === String(b.cardinality ?? "") &&
    (a.structType ?? "") === (b.structType ?? "") &&
    Boolean(a.isRequired) === Boolean(b.isRequired) &&
    JSON.stringify(a.defaultValue ?? null) === JSON.stringify(b.defaultValue ?? null) &&
    JSON.stringify(a.metadata ?? null) === JSON.stringify(b.metadata ?? null)
  );
}

export function arePinListsEqual(
  a?: readonly PinDefinition[] | null,
  b?: readonly PinDefinition[] | null
): boolean {
  const listA = a || [];
  const listB = b || [];
  if (listA.length !== listB.length) return false;
  for (let i = 0; i < listA.length; i++) {
    if (!arePinDefinitionsEqual(listA[i], listB[i])) return false;
  }
  return true;
}

/**
 * Applies a configuration update to a node. When `StructType` changes to a different type,
 * clears dependent entity/field values (e.g. `Target` or old struct fields) so stale IDs
 * from a previous struct type are never retained.
 */
export function applyNodeConfigUpdate(
  currentConfig: Record<string, unknown> | undefined,
  pinId: string,
  value: unknown
): { configValues: Record<string, unknown>; didChangeStructType: boolean } {
  const base = currentConfig || {};
  if (pinId === "StructType") {
    const prevType = String(base["StructType"] ?? "").trim().toLowerCase();
    const nextType = String(value ?? "").trim().toLowerCase();
    if (prevType !== nextType) {
      const nextConfig: Record<string, unknown> = { StructType: value };
      if ("Source" in base) {
        nextConfig["Source"] = base["Source"];
      }
      return { configValues: nextConfig, didChangeStructType: true };
    }
  }
  return {
    configValues: { ...base, [pinId]: value },
    didChangeStructType: false,
  };
}

/**
 * Returns true when a node's pin schema & visual metadata should be driven
 * directly by its Palette definition (SSOT) rather than frozen snapshot pins.
 */
export function isPaletteDrivenShape(
  kind: string | undefined,
  definition?: NodePaletteItemDto
): boolean {
  if (!definition) return false;
  const k = String(kind || "");
  if (k === "Start" || k === "Return" || k === "FlowControl") return false;
  if (definition.hasDynamicPins) return false;
  if (definition.capabilities?.viewVariant === "Collection") return false;
  return true;
}

/**
 * Resolves live pins & metadata from the Palette definition when the node is
 * palette-driven, falling back to snapshot data only for dynamic/missing nodes.
 */
export function resolveNodePinsFromDefinition<
  T extends {
    kind?: string;
    label?: string | null;
    executor?: string | null;
    category?: string | null;
    inputs?: PinDefinition[];
    outputs?: PinDefinition[];
  }
>(nodeData: T, definition?: NodePaletteItemDto) {
  if (!isPaletteDrivenShape(nodeData.kind, definition) || !definition) {
    return {
      inputs: nodeData.inputs || [],
      outputs: nodeData.outputs || [],
      label: nodeData.label || "",
      executor: definition?.executor ?? nodeData.executor,
      category: definition?.category ?? nodeData.category,
    };
  }
  return {
    inputs: (definition.inputs as PinDefinition[]) || [],
    outputs: (definition.outputs as PinDefinition[]) || [],
    label: definition.label || nodeData.label || "",
    executor: definition.executor || nodeData.executor,
    category: definition.category || nodeData.category,
  };
}

function hasMatchingPin(
  pins: readonly PinDefinition[] | undefined,
  handleId: string | null | undefined,
  isOutput: boolean
): boolean {
  const raw = String(handleId || "").trim().toLowerCase();
  if (!raw) return true;
  if (raw === "exec" || (isOutput ? raw === "exec_out" || raw === "out" : raw === "exec_in" || raw === "in")) {
    return true;
  }
  if (!pins || pins.length === 0) return false;
  return pins.some(
    (p) =>
      String(p.id || "").toLowerCase() === raw ||
      String(p.label || "").toLowerCase() === raw
  );
}

/**
 * Reconciles canvas nodes and edges against the latest Palette definitions:
 * - Hydrates static nodes' pins & labels from Palette (SSOT)
 * - Detects and prunes wires connected to pins that no longer exist
 */
export function reconcileGraphWithDefinitions<
  TNode extends { id: string; data: Record<string, any> },
  TEdge extends {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }
>(
  nodes: TNode[],
  edges: TEdge[],
  definitions: Map<string, NodePaletteItemDto>
): {
  nodes: TNode[];
  edges: TEdge[];
  nodesChanged: boolean;
  removedEdges: TEdge[];
} {
  let nodesChanged = false;
  const nextNodes = nodes.map((node) => {
    const data = node.data || {};
    const def = definitions.get(definitionKey(String(data.kind || ""), String(data.refId || "")));
    if (!isPaletteDrivenShape(data.kind, def) || !def) {
      return node;
    }

    const nextInputs = (def.inputs as PinDefinition[]) || [];
    const nextOutputs = (def.outputs as PinDefinition[]) || [];
    const nextLabel = def.label || data.label;
    const nextExecutor = def.executor || data.executor;
    const nextCategory = def.category || data.category;

    const pinsSame =
      arePinListsEqual(data.inputs, nextInputs) &&
      arePinListsEqual(data.outputs, nextOutputs);
    const metaSame =
      data.label === nextLabel &&
      data.executor === nextExecutor &&
      data.category === nextCategory;

    if (pinsSame && metaSame) {
      return node;
    }

    nodesChanged = true;
    return {
      ...node,
      data: {
        ...data,
        inputs: nextInputs,
        outputs: nextOutputs,
        label: nextLabel,
        executor: nextExecutor,
        category: nextCategory,
      },
    };
  });

  const nodeMap = new Map(nextNodes.map((n) => [n.id, n]));
  const removedEdges: TEdge[] = [];
  const nextEdges = edges.filter((edge) => {
    const src = nodeMap.get(edge.source);
    const tgt = nodeMap.get(edge.target);
    if (!src || !tgt) {
      removedEdges.push(edge);
      return false;
    }
    const srcOk = hasMatchingPin(src.data?.outputs, edge.sourceHandle, true);
    const tgtOk = hasMatchingPin(tgt.data?.inputs, edge.targetHandle, false);
    if (!srcOk || !tgtOk) {
      removedEdges.push(edge);
      return false;
    }
    return true;
  });

  return {
    nodes: nextNodes,
    edges: nextEdges,
    nodesChanged,
    removedEdges,
  };
}
