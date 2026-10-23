import type { NodePaletteItemDto, PinDefinition } from "@/gen/model";

export const definitionKey = (kind: string, refId: string) => `${kind}:${refId.toLowerCase()}`;
export function indexDefinitions(items: NodePaletteItemDto[]) {
  const definitions = new Map<string, NodePaletteItemDto>();
  for (const item of items) {
    definitions.set(definitionKey(item.source, item.key), item);
    // Graphs can reference custom definitions by key or persistent ID.
    if (item.id) definitions.set(definitionKey(item.source, item.id), item);
  }
  return definitions;
}
export function nodeView(kind: string, definition?: NodePaletteItemDto) {
  if (["Start", "Return", "FlowControl"].includes(kind)) return kind;
  if (!definition) return "Missing";
  const variant = definition.capabilities?.viewVariant;
  return variant === "Collection" || variant === "Struct" ? variant : "Standard";
}

export function filterPalette(items: NodePaletteItemDto[], executor?: string) {
  return items.filter((item) => {
    if (!item.isVisibleInPalette) return false;
    if (!executor) return true;
    const exec = executor.toLowerCase();
    if (exec === "macro") return item.source === "SubPipeline" || item.category === "Flow Control" || item.key === "Return";
    if (["server", "dotnet", "builtin"].includes(exec)) return item.source === "Tool" || item.source === "BuiltIn" || ["builtin", "dotnet"].includes(item.executor.toLowerCase());
    return item.executor.toLowerCase() === exec;
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
