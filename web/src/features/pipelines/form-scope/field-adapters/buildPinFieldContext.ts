import type { PinDefinition } from "@/gen/model";
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
  const primitive = normalizePinType(pin.primitiveType);
  const cardinality = normalizePinCardinality(pin.cardinality, pin.primitiveType);
  const hint = parsePinMetadataHint(pin.metadata);
  const rawStruct = pin.structType?.trim() || null;

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
