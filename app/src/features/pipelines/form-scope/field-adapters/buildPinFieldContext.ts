import type { PinDefinition } from "@/features/pipelines/types/pipelineGraphTypes";
import { normalizePinType } from "./normalizePinType.ts";
import type { NormalizedCardinality, PinFieldContext, PinMetadataHint } from "./types";

export function normalizePinCardinality(raw: unknown, rawPrimitiveType?: unknown): NormalizedCardinality {
  const s = String(raw ?? "").toLowerCase().trim();
  if (s === "map" || s === "2") return "Map";
  if (s === "array" || s === "1") return "Array";
  const p = String(rawPrimitiveType ?? "").toLowerCase().trim();
  if (p.endsWith("[]") || p.includes("array") || p.includes("list")) return "Array";
  return "Single";
}

export function parsePinMetadataHint(metadata: unknown): PinMetadataHint | null {
  if (!metadata) return null;
  try {
    const parsed = typeof metadata === "string" ? JSON.parse(metadata) : metadata;
    return parsed && typeof parsed === "object" ? (parsed as PinMetadataHint) : null;
  } catch {
    return null;
  }
}

export function buildPinFieldContext(
  pin: PinDefinition,
  configValues: Record<string, unknown> = {}
): PinFieldContext {
  const pinId = pin.id || "";
  const label = pin.label || pinId;
  const primitive = normalizePinType((pin as any).dataType ?? pin.primitiveType);
  const cardinality = normalizePinCardinality(pin.cardinality, (pin as any).dataType ?? pin.primitiveType);
  let hint = parsePinMetadataHint(pin.metadata);
  if (pin.uiMeta?.inputMode) {
    if (pin.uiMeta.inputMode === "path" || pin.uiMeta.inputMode === "directory") {
      hint = {
        ...hint,
        type: hint?.type || "path",
        pathKind: hint?.pathKind || (pin.uiMeta.inputMode === "directory" ? "folder" : "file"),
        accept: hint?.accept || (pin.uiMeta.acceptExtensions?.length ? pin.uiMeta.acceptExtensions.join(",") : undefined),
      };
    } else if (pin.uiMeta.inputMode === "multiline") {
      hint = { ...hint, type: hint?.type || "textarea", multiline: true };
    } else if (pin.uiMeta.inputMode === "select") {
      hint = { ...hint, type: hint?.type || "select" };
    }
  }
  const rawStruct = (pin as any).structSlug?.trim() || pin.structType?.trim() || null;

  return {
    pin,
    pinId,
    label,
    primitive,
    cardinality,
    structType: rawStruct,
    hint,
    configValues,
  };
}
