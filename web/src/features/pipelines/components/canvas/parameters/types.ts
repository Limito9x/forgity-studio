export type ParameterTab = "inputs" | "outputs" | "variables";

export const TYPE_OPTIONS = [
  { value: "String", label: "String", color: "text-sky-500 bg-sky-500/10 border-sky-500/30" },
  { value: "Number", label: "Number", color: "text-violet-500 bg-violet-500/10 border-violet-500/30" },
  { value: "Boolean", label: "Boolean", color: "text-amber-500 bg-amber-500/10 border-amber-500/30" },
  { value: "EntityRef", label: "EntityRef / Struct", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30" },
  { value: "Asset", label: "Asset", color: "text-pink-500 bg-pink-500/10 border-pink-500/30" },
];

export const CARDINALITY_OPTIONS = [
  { value: "Single", label: "Single" },
  { value: "Array", label: "Array []" },
  { value: "Map", label: "Map {}" },
];

export function normalizeType(t: any): string {
  if (t === 0 || t === "0" || t === "String" || t === "Path") return "String";
  if (t === 1 || t === "1" || t === "Number") return "Number";
  if (t === 2 || t === "2" || t === "Boolean") return "Boolean";
  if (t === 3 || t === "3" || t === 4 || t === "4" || t === "EntityRef") return "EntityRef";
  if (t === 5 || t === "5" || t === "Asset") return "Asset";
  return String(t || "String");
}

export function normalizeCardinality(c: any): string {
  if (c === 0 || c === "0" || c === "Single") return "Single";
  if (c === 1 || c === "1" || c === "Array") return "Array";
  if (c === 2 || c === "2" || c === "Map") return "Map";
  return String(c || "Single");
}

export const isEntityRef = (t: string) => t === "EntityRef" || t === "4";

export function getTypeStyle(t: number | string, c?: number | string, sType?: string | null) {
  const normT = normalizeType(t);
  const normC = normalizeCardinality(c);
  const opt = TYPE_OPTIONS.find((o) => o.value === normT) || TYPE_OPTIONS[0];
  const isMap = normC === "Map";
  const isArr = normC === "Array";
  const label = normT === "EntityRef" && sType ? sType : opt.label;

  return {
    label: isMap ? `Map<${label}>` : isArr ? `${label}[]` : label,
    color: opt.color,
  };
}
