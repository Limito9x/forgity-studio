/**
 * Chuẩn hóa nhãn hiển thị của node script theo Title Case đồng bộ
 * Xử lý: snake_case, kebab-case, camelCase, và giữ nguyên các từ viết tắt chuyên ngành (FBX, UE5, DAZ, AO, UV...)
 */
export function formatNodeLabel(nameOrLabel: string): string {
  if (!nameOrLabel) return "";
  const clean = nameOrLabel.replace(/\.py$/i, "").trim();

  // Tách theo _, -, khoảng trắng, hoặc CamelCase boundaries (e.g. dazBodyUE5 -> daz Body UE5)
  const words = clean
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const SPECIAL_ACRONYMS: Record<string, string> = {
    FBX: "FBX",
    UE5: "UE5",
    UE4: "UE4",
    UE: "UE",
    DAZ: "DAZ",
    AO: "AO",
    UV: "UV",
    RGB: "RGB",
    RGBA: "RGBA",
    ORM: "ORM",
    ORMA: "ORMA",
    JSON: "JSON",
    YAML: "YAML",
    YML: "YAML",
    IK: "IK",
    FK: "FK",
    LOD: "LOD",
    DCC: "DCC",
    AI: "AI",
    AST: "AST",
  };

  return words
    .map((w) => {
      const upper = w.toUpperCase();
      if (SPECIAL_ACRONYMS[upper]) {
        return SPECIAL_ACRONYMS[upper];
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}
