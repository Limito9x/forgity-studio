import type { PinDefinition, PinPrimitiveType } from "@/gen/model";
import type { PipelineFileAssetDto } from "../../../hooks/usePipelineGraph";
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
  fileAssets?: Record<string, PipelineFileAssetDto> | null;
  executionStatus?: "idle" | "running" | "succeeded" | "failed";
  executionError?: string | null;
  executionOutputs?: Record<string, any> | null;
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
  EntityRef: { bgClass: "bg-emerald-500", textClass: "text-emerald-600 dark:text-emerald-400" },
  Asset: { bgClass: "bg-pink-500", textClass: "text-pink-600 dark:text-pink-400" },
};

export function getPinVisual(type?: PinPrimitiveType | number | string, pin?: PinDefinition): PinTypeVisual {
  let norm = normalizePinType(type);

  if (norm === "String" && pin) {
    let hintType: string | undefined;
    if (pin.metadata) {
      try {
        const metaObj = typeof pin.metadata === "string" ? JSON.parse(pin.metadata) : pin.metadata;
        hintType = metaObj?.type?.toLowerCase();
      } catch { }
    }

    const idLower = (pin.id || "").toLowerCase();
    if (
      hintType === "file" ||
      hintType === "asset" ||
      idLower.includes("preset") ||
      idLower.endsWith("_file") ||
      idLower.endsWith("_asset")
    ) {
      norm = "Asset";
    }
  }

  const visual = getCatalogueVisual(norm);
  let style = PIN_BG_CLASSES[norm] || PIN_BG_CLASSES.String;

  const cardVal = pin?.cardinality as any;
  const isMap = cardVal === 2 || cardVal === "2" || cardVal === "Map" || cardVal === "map";
  if (isMap) {
    const pinIdLower = (pin?.id || "").toLowerCase();
    const isAssetMap = (pin as any)?.valueType === "Asset" || pinIdLower.endsWith("_maps") || pinIdLower.includes("baked");
    if (isAssetMap) {
      style = PIN_BG_CLASSES.Asset;
      return {
        label: "Asset Map",
        hex: "#ec4899",
        bgClass: style.bgClass,
        textClass: style.textClass,
      };
    }
  }

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
export function isEntityRefPin(type?: unknown) {
  return normalizePinType(type) === "EntityRef";
}
export function isAssetPin(type?: unknown) {
  return normalizePinType(type) === "Asset";
}
export function isVariablePin(structType?: string | null, _pinId?: string, _type?: unknown) {
  return structType === "Variable";
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

export function formatPinTypeLabel(type?: PinPrimitiveType | number | string, cardinality?: any, pin?: PinDefinition): string {
  const visual = getPinVisual(type, pin);
  const isArray = cardinality === 1 || cardinality === "1" || cardinality === "Array" || cardinality === "array";
  const isMap = cardinality === 2 || cardinality === "2" || cardinality === "Map" || cardinality === "map";

  if (isMap) {
    const rawKey = (pin as any)?.keyType || "Text";
    let rawVal = (pin as any)?.valueType;
    if (!rawVal) {
      const pinIdLower = (pin?.id || "").toLowerCase();
      if (pin?.structType) {
        rawVal = pin.structType;
      } else if (
        pinIdLower.endsWith("_maps") ||
        pinIdLower.endsWith("_paths") ||
        pinIdLower.endsWith("_files") ||
        pinIdLower.includes("texture") ||
        pinIdLower === "baked_maps"
      ) {
        rawVal = "Asset";
      } else if (pinIdLower === "material_roles") {
        rawVal = "Text";
      } else if (visual.label === "File Upload" || visual.label === "Asset") {
        rawVal = "Asset";
      } else {
        rawVal = "Text";
      }
    }
    return `Map<${rawKey}, ${rawVal}>`;
  }
  if (isArray) {
    return `${visual.label}[]`;
  }
  return visual.label;
}
