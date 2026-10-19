import React from "react";
import {
  Box,
  FileCode,
  FileImage,
  FileText,
  FileJson,
  Archive,
  Layers,
  Sparkles,
  Gamepad2,
  Video,
  Music,
} from "lucide-react";
import { cn } from "@/lib/utils";

import blenderSvg from "@/assets/dcc/blender.svg";
import unrealSvg from "@/assets/dcc/unreal-engine.svg";
import daz3dSvg from "@/assets/dcc/daz3d.svg";
import pythonSvg from "@/assets/dcc/python.svg";

export interface FileTypeIconProps {
  fileName?: string;
  filePath?: string;
  relativePath?: string;
  extension?: string;
  className?: string;
  iconClassName?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showExtensionBadge?: boolean;
}

interface FormatMeta {
  ext: string;
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  IconComponent: React.ComponentType<{ className?: string }>;
  svgSrc?: string;
}

function extractExt(candidate?: string): string {
  if (!candidate) return "";
  const clean = candidate.split("?")[0].split("#")[0].trim();
  const lastDot = clean.lastIndexOf(".");
  if (lastDot !== -1 && lastDot < clean.length - 1) {
    return clean.slice(lastDot + 1).toLowerCase();
  }
  return "";
}

function resolveFormat(props: FileTypeIconProps): FormatMeta {
  let ext = (props.extension || "").toLowerCase().replace(/^\./, "").trim();
  if (!ext) {
    // Trích xuất từ filePath/relativePath trước (vì fileName thường chỉ là DisplayName như "Eva")
    ext =
      extractExt(props.filePath) ||
      extractExt(props.relativePath) ||
      extractExt(props.fileName);
  }

  // 1. Blender (Official Local SVG)
  if (ext === "blend" || ext === "blend1") {
    return {
      ext,
      label: "BLEND",
      colorClass: "text-amber-500 dark:text-amber-400",
      bgClass: "bg-amber-500/10",
      borderClass: "border-amber-500/30",
      IconComponent: Box,
      svgSrc: blenderSvg,
    };
  }

  // 2. Unreal Engine (Official Local SVG)
  if (ext === "uasset" || ext === "umap") {
    return {
      ext,
      label: ext.toUpperCase(),
      colorClass: "text-sky-500 dark:text-sky-400",
      bgClass: "bg-sky-500/10",
      borderClass: "border-sky-500/30",
      IconComponent: Gamepad2,
      svgSrc: unrealSvg,
    };
  }

  // 3. DAZ 3D Studio (Official Local SVG)
  if (ext === "duf" || ext === "dsf" || ext === "dse") {
    return {
      ext,
      label: ext.toUpperCase(),
      colorClass: "text-purple-500 dark:text-purple-400",
      bgClass: "bg-purple-500/10",
      borderClass: "border-purple-500/30",
      IconComponent: Sparkles,
      svgSrc: daz3dSvg,
    };
  }

  // 4. 3D Meshes / Geometry
  if (
    ["fbx", "obj", "gltf", "glb", "usd", "usda", "usdc", "abc", "dae", "stl"].includes(ext)
  ) {
    return {
      ext,
      label: ext.toUpperCase(),
      colorClass: "text-cyan-500 dark:text-cyan-400",
      bgClass: "bg-cyan-500/10",
      borderClass: "border-cyan-500/30",
      IconComponent: Layers,
    };
  }

  // 5. Textures / Images
  if (
    [
      "png",
      "jpg",
      "jpeg",
      "tga",
      "exr",
      "hdr",
      "dds",
      "tiff",
      "tif",
      "webp",
      "bmp",
    ].includes(ext)
  ) {
    return {
      ext,
      label: ext.toUpperCase(),
      colorClass: "text-pink-500 dark:text-pink-400",
      bgClass: "bg-pink-500/10",
      borderClass: "border-pink-500/30",
      IconComponent: FileImage,
    };
  }

  // 6. Python Script (Official Local SVG)
  if (ext === "py" || ext === "pyw") {
    return {
      ext,
      label: "PY",
      colorClass: "text-[#3776AB] dark:text-[#5dade2]",
      bgClass: "bg-[#3776AB]/10",
      borderClass: "border-[#3776AB]/30",
      IconComponent: FileCode,
      svgSrc: pythonSvg,
    };
  }

  // 7. General Scripts / Code
  if (["cs", "sh", "bat", "ps1", "js", "ts", "lua"].includes(ext)) {
    return {
      ext,
      label: ext.toUpperCase(),
      colorClass: "text-emerald-500 dark:text-emerald-400",
      bgClass: "bg-emerald-500/10",
      borderClass: "border-emerald-500/30",
      IconComponent: FileCode,
    };
  }

  // 7. Config / Structured Data
  if (["json", "yaml", "yml", "toml", "xml", "csv"].includes(ext)) {
    return {
      ext,
      label: ext.toUpperCase(),
      colorClass: "text-orange-500 dark:text-orange-400",
      bgClass: "bg-orange-500/10",
      borderClass: "border-orange-500/30",
      IconComponent: FileJson,
    };
  }

  // 8. Video
  if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) {
    return {
      ext,
      label: ext.toUpperCase(),
      colorClass: "text-red-500 dark:text-red-400",
      bgClass: "bg-red-500/10",
      borderClass: "border-red-500/30",
      IconComponent: Video,
    };
  }

  // 9. Audio
  if (["wav", "mp3", "ogg", "flac"].includes(ext)) {
    return {
      ext,
      label: ext.toUpperCase(),
      colorClass: "text-indigo-500 dark:text-indigo-400",
      bgClass: "bg-indigo-500/10",
      borderClass: "border-indigo-500/30",
      IconComponent: Music,
    };
  }

  // 10. Archives
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return {
      ext,
      label: ext.toUpperCase(),
      colorClass: "text-yellow-600 dark:text-yellow-400",
      bgClass: "bg-yellow-500/10",
      borderClass: "border-yellow-500/30",
      IconComponent: Archive,
    };
  }

  // Fallback
  return {
    ext: ext || "file",
    label: ext ? ext.toUpperCase() : "FILE",
    colorClass: "text-muted-foreground",
    bgClass: "bg-muted/50",
    borderClass: "border-border/60",
    IconComponent: FileText,
  };
}

const sizeConfig = {
  xs: { box: "h-5 w-5 rounded p-0.5", icon: "h-3.5 w-3.5", text: "text-[9px]" },
  sm: { box: "h-6 w-6 rounded-md p-1", icon: "h-4 w-4", text: "text-[10px]" },
  md: { box: "h-8 w-8 rounded-lg p-1.5", icon: "h-5 w-5", text: "text-xs" },
  lg: { box: "h-10 w-10 rounded-xl p-2", icon: "h-6 w-6", text: "text-xs" },
  xl: { box: "h-12 w-12 rounded-xl p-2.5", icon: "h-7 w-7", text: "text-sm" },
};

export function FileTypeIcon(props: FileTypeIconProps) {
  const {
    className,
    iconClassName,
    size = "md",
    showExtensionBadge = false,
  } = props;

  const meta = resolveFormat(props);
  const cfg = sizeConfig[size] || sizeConfig.md;
  const { IconComponent } = meta;

  return (
    <div className={cn("inline-flex items-center gap-1.5 shrink-0 select-none", className)}>
      <div
        className={cn(
          "flex items-center justify-center border shadow-2xs transition-colors overflow-hidden",
          cfg.box,
          meta.bgClass,
          meta.borderClass,
          meta.colorClass
        )}
      >
        {meta.svgSrc ? (
          <img
            src={meta.svgSrc}
            alt={meta.label}
            className={cn("object-contain pointer-events-none", cfg.icon, iconClassName)}
            loading="lazy"
          />
        ) : (
          <IconComponent className={cn(cfg.icon, iconClassName)} />
        )}
      </div>

      {showExtensionBadge && meta.ext && (
        <span
          className={cn(
            "font-mono font-semibold uppercase tracking-wider",
            cfg.text,
            meta.colorClass
          )}
        >
          {meta.label}
        </span>
      )}
    </div>
  );
}
