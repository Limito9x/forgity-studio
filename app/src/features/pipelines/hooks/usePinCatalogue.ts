export type NormalizedPinType =
  | "String"
  | "Number"
  | "Boolean";

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
 * Hook trả về Pin Catalogue tĩnh (Local-First SSOT)
 */
export function usePinCatalogue() {
  return {
    catalogue: Object.values(STATIC_PIN_CATALOGUE),
    isLoading: false,
    getPinVisual,
    normalizePinType,
  };
}
