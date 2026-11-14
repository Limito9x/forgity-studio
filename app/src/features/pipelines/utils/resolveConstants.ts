import type { NodePaletteItemDto } from "@/gen/model";

/**
 * Extracts a key -> value map of workspace Constants from paletteItems.
 */
export function extractConstantsMap(paletteItems: NodePaletteItemDto[] = []): Record<string, string> {
  const map: Record<string, string> = {};
  for (const rawItem of paletteItems) {
    const item = rawItem as any;
    const caps = item.capabilities && typeof item.capabilities === "object" ? item.capabilities : undefined;
    const itemKey = String(item.key || item.refId || item.id || "");
    const isConst =
      Boolean(caps?.isConstantNode) ||
      itemKey.startsWith("local:constant:") ||
      itemKey.startsWith("const:") ||
      String(item.category || "").toLowerCase() === "constants";
    if (!isConst) continue;

    const constName =
      caps?.constantKey ||
      item.name ||
      (itemKey.startsWith("local:constant:")
        ? itemKey.slice("local:constant:".length)
        : itemKey.startsWith("const:")
          ? itemKey.slice("const:".length)
          : String(item.label || itemKey).replace(/^Constant:\s*/i, ""));
    if (!constName) continue;

    const val =
      caps?.resolvedValue ??
      item.constantValue ??
      (item.defaultConfigValues && typeof item.defaultConfigValues === "object"
        ? (item.defaultConfigValues as Record<string, any>).value
        : undefined);

    if (val !== undefined && val !== null) {
      map[String(constName)] = String(val);
    }
  }
  return map;
}

/**
 * Recursively expands `${VAR}` references using the provided constants map.
 */
export function resolveConstants(input: string, constants: Record<string, string>): string {
  if (!input || !input.includes("${")) return input;
  const keys = Object.keys(constants);
  if (keys.length === 0) return input;

  let current = input;
  for (let pass = 0; pass < 8; pass++) {
    let next = current;
    for (const key of keys) {
      const braced = `\${${key}}`;
      if (next.includes(braced)) {
        next = next.split(braced).join(constants[key]);
      }
    }
    if (next === current) break;
    current = next;
  }
  return current;
}
