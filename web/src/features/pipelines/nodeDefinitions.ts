import type { NodePaletteItemDto } from "@/gen/model";

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

