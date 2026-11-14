/**
 * Utility for converting between Windows Physical Disk Paths and Unreal Engine Virtual Paths (/Game/...)
 * Aligned with BL-043 (Project DCC Conventions Vault & Wide Unreal Content Browser)
 */

export function normalizePathSlashes(p: string): string {
  if (!p) return "";
  return p.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
}

/**
 * Converts a physical disk path into an Unreal Engine virtual path (/Game/...)
 * e.g. "D:/Projects/MyGame/Content/Characters/Genesis9" -> "/Game/Characters/Genesis9"
 */
export function toUnrealVirtualPath(
  diskPath: string,
  contentDirOrRoot: string,
): string {
  const normDisk = normalizePathSlashes(diskPath);
  if (!normDisk) return "/Game";
  if (normDisk.startsWith("/Game/") || normDisk === "/Game") {
    return normDisk;
  }

  const normRoot = normalizePathSlashes(contentDirOrRoot);
  // Ensure we compare against .../Content
  const contentBase = normRoot.toLowerCase().endsWith("/content")
    ? normRoot
    : `${normRoot}/Content`;

  if (normDisk.toLowerCase().startsWith(contentBase.toLowerCase())) {
    const rel = normDisk.slice(contentBase.length).replace(/^\/+/, "");
    return rel ? `/Game/${rel}` : "/Game";
  }

  // Fallback: search for "/Content/" in disk path
  const contentIdx = normDisk.toLowerCase().indexOf("/content/");
  if (contentIdx !== -1) {
    const rel = normDisk.slice(contentIdx + "/content/".length);
    return `/Game/${rel}`;
  }

  return normDisk.startsWith("/") ? normDisk : `/Game/${normDisk}`;
}

/**
 * Converts an Unreal virtual path (/Game/...) back to a physical disk path
 * e.g. "/Game/Characters/Genesis9" -> "D:/Projects/MyGame/Content/Characters/Genesis9"
 */
export function toDiskPath(
  virtualPath: string,
  contentDirOrRoot: string,
): string {
  const normVirt = normalizePathSlashes(virtualPath);
  if (!normVirt) return normalizePathSlashes(contentDirOrRoot);

  const normRoot = normalizePathSlashes(contentDirOrRoot);
  const contentBase = normRoot.toLowerCase().endsWith("/content")
    ? normRoot
    : `${normRoot}/Content`;

  if (normVirt.startsWith("/Game")) {
    const rel = normVirt.slice("/Game".length).replace(/^\/+/, "");
    return rel ? `${contentBase}/${rel}` : contentBase;
  }

  // If already looks like a disk path (e.g. "D:/...")
  if (/^[a-zA-Z]:\//.test(normVirt) || normVirt.startsWith("/")) {
    return normVirt;
  }

  return `${contentBase}/${normVirt}`;
}
