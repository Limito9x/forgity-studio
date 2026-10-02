import type { PinDefinition, PinPrimitiveType } from "@/gen/model";
import {
  normalizePinType,
  getPinVisual as getCatalogueVisual,
  type NormalizedPinType,
} from "../../../hooks/usePinCatalogue";

export interface CustomPipelineNodeData extends Record<string, unknown> {
  refId: string;
  kind: string; // "Start" | "Return" | "Tool" | "FlowControl" | "Variable"
  label: string;
  category?: string | null;
  executor?: string | null;
  inputs: PinDefinition[];
  outputs: PinDefinition[];
  configValues?: Record<string, any>;
  executionStatus?: "idle" | "running" | "succeeded" | "failed";
  executionError?: string | null;
  pipelineId?: string;
}

export interface PinTypeVisual {
  label: string;
  hex: string;
  bgClass: string;
  textClass: string;
}

const PIN_BG_CLASSES: Record<NormalizedPinType, { bgClass: string; textClass: string }> = {
  String: { bgClass: "bg-sky-500", textClass: "text-sky-600 dark:text-sky-400" },
  Number: { bgClass: "bg-purple-500", textClass: "text-purple-600 dark:text-purple-400" },
  Boolean: { bgClass: "bg-amber-500", textClass: "text-amber-600 dark:text-amber-400" },
  Path: { bgClass: "bg-orange-500", textClass: "text-orange-600 dark:text-orange-400" },
  EntityRef: { bgClass: "bg-emerald-500", textClass: "text-emerald-600 dark:text-emerald-400" },
  Asset: { bgClass: "bg-pink-500", textClass: "text-pink-600 dark:text-pink-400" },
};

export function getPinVisual(type?: PinPrimitiveType | number | string): PinTypeVisual {
  const norm = normalizePinType(type);
  const visual = getCatalogueVisual(norm);
  const style = PIN_BG_CLASSES[norm] || PIN_BG_CLASSES.String;

  return {
    label: visual.label,
    hex: visual.handleColor,
    bgClass: style.bgClass,
    textClass: style.textClass,
  };
}

export function isStringPin(type?: unknown) {
  return normalizePinType(type) === "String";
}
export function isNumberPin(type?: unknown) {
  return normalizePinType(type) === "Number";
}
export function isBooleanPin(type?: unknown) {
  return normalizePinType(type) === "Boolean";
}
export function isPathPin(type?: unknown) {
  return normalizePinType(type) === "Path";
}
export function isEntityRefPin(type?: unknown) {
  return normalizePinType(type) === "EntityRef";
}
export function isAssetPin(type?: unknown) {
  return normalizePinType(type) === "Asset";
}
export function isVariablePin(type?: unknown, pinId?: string, entityTarget?: string | null) {
  return (
    entityTarget === "variable" ||
    pinId?.toLowerCase() === "variablename" ||
    pinId?.toLowerCase() === "targetvariable" ||
    String(type).toLowerCase() === "variable" ||
    String(type) === "6"
  );
}

export function isExecPin(p: PinDefinition): boolean {
  const rawKind = String((p as any).kind ?? "").toLowerCase();
  if (rawKind === "exec" || rawKind === "1") return true;
  if (rawKind === "data" || rawKind === "0") return false;

  const idLower = (p.id || "").toLowerCase();
  const labelLower = (p.label || "").toLowerCase();

  return (
    idLower === "exec" ||
    idLower === "exec_in" ||
    idLower === "exec_out" ||
    idLower === "loop_body" ||
    idLower === "completed" ||
    labelLower === "exec"
  );
}

export function formatPinTypeLabel(type?: PinPrimitiveType | number | string, cardinality?: any): string {
  const visual = getPinVisual(type);
  const isArray = cardinality === 1 || cardinality === "1" || cardinality === "Array" || cardinality === "array";
  const isMap = cardinality === 2 || cardinality === "2" || cardinality === "Map" || cardinality === "map";

  if (isMap) {
    return `Map<${visual.label}>`;
  }
  if (isArray) {
    return `${visual.label}[]`;
  }
  return visual.label;
}
