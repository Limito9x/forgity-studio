import { useGetPinCatalogue } from "@/gen/endpoints/pipelines/pipelines";
import type { PinTypeMetadataDto } from "@/gen/model";

export type NormalizedPinType =
  | "String"
  | "Number"
  | "Boolean"
  | "EntityRef"
  | "Asset";

export interface PinVisualInfo {
  code: NormalizedPinType;
  label: string;
  color: string;
  badgeStyle: string;
  handleColor: string;
  defaultControl: string;
}

// Fallback tĩnh chuẩn xác để Canvas và Inspector hiển thị ngay lập tức không bị delay
export const STATIC_PIN_CATALOGUE: Record<NormalizedPinType, PinVisualInfo> = {
  String: {
    code: "String",
    label: "Text",
    color: "#0ea5e9",
    badgeStyle: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    handleColor: "#0ea5e9",
    defaultControl: "text",
  },
  Number: {
    code: "Number",
    label: "Number",
    color: "#8b5cf6",
    badgeStyle: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    handleColor: "#8b5cf6",
    defaultControl: "number",
  },
  Boolean: {
    code: "Boolean",
    label: "Boolean",
    color: "#f59e0b",
    badgeStyle: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    handleColor: "#f59e0b",
    defaultControl: "boolean",
  },
  EntityRef: {
    code: "EntityRef",
    label: "Entity Reference",
    color: "#10b981",
    badgeStyle: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    handleColor: "#10b981",
    defaultControl: "entity-select",
  },
  Asset: {
    code: "Asset",
    label: "File Upload",
    color: "#ec4899",
    badgeStyle: "bg-pink-500/10 text-pink-400 border-pink-500/30",
    handleColor: "#ec4899",
    defaultControl: "file-upload",
  },
};

/**
 * Chuẩn hóa bất kỳ input nào (number index cũ, string hoa thường) về đúng NormalizedPinType
 */
export function normalizePinType(rawType: unknown): NormalizedPinType {
  if (rawType === undefined || rawType === null) return "String";

  const s = String(rawType).toLowerCase().trim();
  switch (s) {
    case "1":
    case "number":
      return "Number";
    case "2":
    case "boolean":
      return "Boolean";
    case "3":
    case "4":
    case "entityref":
    case "struct":
    case "workspace":
    case "resource":
    case "6":
    case "variable":
      return "EntityRef";
    case "5":
    case "asset":
    case "file":
      return "Asset";
    case "0":
    case "string":
    case "path":
    default:
      return "String";
  }
}

/**
 * Lấy PinVisualInfo nhanh chóng từ NormalizedPinType
 */
export function getPinVisual(rawType: unknown): PinVisualInfo {
  const norm = normalizePinType(rawType);
  return STATIC_PIN_CATALOGUE[norm];
}

/**
 * Hook kết nối Pin Catalogue từ Backend làm Single Source of Truth
 */
export function usePinCatalogue() {
  const { data, isLoading } = useGetPinCatalogue({
    query: {
      staleTime: 1000 * 60 * 30, // 30 phút cache
    },
  });

  const catalogue = (data as unknown as PinTypeMetadataDto[]) ?? [];

  return {
    catalogue,
    isLoading,
    getPinVisual,
    normalizePinType,
  };
}
