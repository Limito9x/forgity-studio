export interface SoftwareDefinition {
  id: string;
  name: string;
  category: "DCC" | "Game Engine" | "Runtime" | "Compositing" | "Other";
  aliases: string[];
  simpleIconSlug?: string;
  iconUrl?: string;
  brandColor?: string;
  description?: string;
}

export interface SoftwareCatalogItem {
  key: string;
  name: string;
  category: "DCC" | "Game Engine" | "Runtime" | "Compositing" | "Other";
  iconUrl: string;
  brandColor?: string;
  description?: string;
}

/**
 * Vector SVG nhúng trực tiếp cho Daz 3D (do SimpleIcons chưa có slug chính thức)
 */
const DAZ3D_INLINE_SVG = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><polygon points="24,4 42,14 24,24 6,14" fill="%2300B4D8"/><polygon points="42,14 42,34 24,44 24,24" fill="%230077B6"/><polygon points="6,14 24,24 24,44 6,34" fill="%23023E8A"/><text x="24" y="27" font-family="Arial,sans-serif" font-size="9" font-weight="900" fill="%23FFFFFF" text-anchor="middle" letter-spacing="0.5">DAZ</text></svg>`;

/**
 * Danh sách cấu hình chuẩn duy nhất (Single Source of Truth)
 * Định nghĩa id, tên hiển thị, category, và mảng aliases linh hoạt.
 */
export const SOFTWARE_DEFINITIONS: SoftwareDefinition[] = [
  {
    id: "blender",
    name: "Blender 3D",
    category: "DCC",
    aliases: ["blender", "blender3d"],
    simpleIconSlug: "blender/F5792A",
    brandColor: "#F5792A",
    description: "Open-source 3D creation suite (modeling, rigging, rendering)",
  },
  {
    id: "unreal",
    name: "Unreal Engine",
    category: "Game Engine",
    aliases: ["unreal", "unrealengine", "ue", "ue5", "ue4"],
    simpleIconSlug: "unrealengine/ffffff",
    brandColor: "#0E1128",
    description: "Real-time 3D creation tool for photoreal visuals and immersive experiences",
  },
  {
    id: "python",
    name: "Python Environment",
    category: "Runtime",
    aliases: ["python", "python3", "py"],
    simpleIconSlug: "python/3776AB",
    brandColor: "#3776AB",
    description: "Core automation runtime & pipeline scripting environment",
  },
  {
    id: "daz_studio",
    name: "Daz Studio",
    category: "DCC",
    aliases: ["daz", "daz3d", "dazstudio"],
    iconUrl: DAZ3D_INLINE_SVG,
    brandColor: "#00B4D8",
    description: "3D character creation, digital figure posing, morphs & animation",
  },
  {
    id: "maya",
    name: "Autodesk Maya",
    category: "DCC",
    aliases: ["maya", "autodeskmaya"],
    simpleIconSlug: "autodesk/0696D7",
    brandColor: "#0696D7",
    description: "3D animation, modeling, simulation, and rendering software",
  },
  {
    id: "3dsmax",
    name: "Autodesk 3ds Max",
    category: "DCC",
    aliases: ["3dsmax", "max", "autodesk3dsmax"],
    simpleIconSlug: "autodesk/0696D7",
    brandColor: "#0696D7",
    description: "3D modeling and rendering software for design visualization & games",
  },
  {
    id: "houdini",
    name: "SideFX Houdini",
    category: "DCC",
    aliases: ["houdini", "sidefxhoudini"],
    simpleIconSlug: "sidefx/FF5100",
    brandColor: "#FF5100",
    description: "Procedural node-based 3D animation and visual effects tool",
  },
  {
    id: "cinema4d",
    name: "Maxon Cinema 4D",
    category: "DCC",
    aliases: ["cinema4d", "c4d", "maxoncinema4d"],
    simpleIconSlug: "maxon/002F6C",
    brandColor: "#002F6C",
    description: "Professional 3D modeling, animation, simulation and rendering software",
  },
  {
    id: "unity",
    name: "Unity Engine",
    category: "Game Engine",
    aliases: ["unity", "unity3d", "unityengine"],
    simpleIconSlug: "unity/ffffff",
    brandColor: "#222C37",
    description: "Multi-platform game engine and interactive real-time development tool",
  },
];

/**
 * Chuẩn hóa chuỗi tìm kiếm (xóa ký tự đặc biệt, chuyển về chữ thường)
 */
function normalizeKey(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Xây dựng bản đồ tra cứu O(1) từ alias -> SoftwareDefinition
 */
const ALIAS_LOOKUP_MAP = new Map<string, SoftwareDefinition>();

for (const def of SOFTWARE_DEFINITIONS) {
  ALIAS_LOOKUP_MAP.set(normalizeKey(def.id), def);
  for (const alias of def.aliases) {
    ALIAS_LOOKUP_MAP.set(normalizeKey(alias), def);
  }
}

/**
 * Trả về icon URL chuẩn (hoặc CDN SimpleIcons hoặc custom inline SVG)
 */
function resolveIconUrl(def: SoftwareDefinition): string {
  if (def.iconUrl) {
    return def.iconUrl;
  }
  if (def.simpleIconSlug) {
    return `https://cdn.simpleicons.org/${def.simpleIconSlug}`;
  }
  return "";
}

/**
 * Helper tìm thông tin metadata phần mềm theo executorKey (hỗ trợ alias, substring)
 */
export function getSoftwareMetadata(executorKey: string): SoftwareCatalogItem {
  const cleanKey = normalizeKey(executorKey);

  // 1. Khớp chính xác qua Map
  const exactMatch = ALIAS_LOOKUP_MAP.get(cleanKey);
  if (exactMatch) {
    return {
      key: exactMatch.id,
      name: exactMatch.name,
      category: exactMatch.category,
      iconUrl: resolveIconUrl(exactMatch),
      brandColor: exactMatch.brandColor,
      description: exactMatch.description,
    };
  }

  // 2. Khớp theo chuỗi con (substring / contains)
  for (const def of SOFTWARE_DEFINITIONS) {
    for (const alias of def.aliases) {
      const cleanAlias = normalizeKey(alias);
      if (cleanKey.includes(cleanAlias) || cleanAlias.includes(cleanKey)) {
        return {
          key: def.id,
          name: def.name,
          category: def.category,
          iconUrl: resolveIconUrl(def),
          brandColor: def.brandColor,
          description: def.description,
        };
      }
    }
  }

  // 3. Fallback nếu là custom tool chưa đăng ký
  return {
    key: executorKey,
    name: executorKey.charAt(0).toUpperCase() + executorKey.slice(1),
    category: "Other",
    iconUrl: "",
    description: "Custom workstation executor tool",
  };
}
