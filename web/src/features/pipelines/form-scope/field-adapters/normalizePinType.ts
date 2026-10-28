export type NormalizedPinType =
  "String" | "Number" | "Boolean" | "EntityRef" | "Asset";

/**
 * Normalizes any pin primitive type (number index, uppercase/lowercase string) to NormalizedPinType.
 * Pure logic decoupled from React Query / generated endpoint imports.
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
