import { definitionKey, indexDefinitions } from "../../nodeDefinitions";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { NodePaletteItemDto } from "@/features/pipelines/types/pipelineGraphTypes";

const Definitions = createContext<Map<string, NodePaletteItemDto>>(new Map());
export function NodeDefinitionsProvider({ items, children }: { items: NodePaletteItemDto[]; children: ReactNode }) {
  const definitions = useMemo(() => indexDefinitions(items), [items]);
  return <Definitions.Provider value={definitions}>{children}</Definitions.Provider>;
}
export function useNodeDefinition(kind = "", refId = "") {
  return useContext(Definitions).get(definitionKey(kind, refId));
}
export function useNodeDefinitionsMap() {
  return useContext(Definitions);
}
