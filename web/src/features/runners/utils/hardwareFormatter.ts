import { formatRelativeTime } from "@/lib/temporal";

export { formatRelativeTime };

/**
 * Format raw bytes into human readable binary units (B, KB, MB, GB, TB)
 */
export function formatBytes(bytes?: number | null, decimals = 1): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes < 0) {
    return "N/A";
  }
  if (bytes === 0) return "0 B";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) return `${bytes} B`;
  const index = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`;
}

/**
 * Clean up verbose GPU names into concise labels suitable for UI badges.
 * e.g., "NVIDIA GeForce RTX 3050 Laptop GPU" -> "NVIDIA RTX 3050"
 */
export function formatGpuName(gpuName?: string | null): string {
  if (!gpuName) return "Unknown GPU";

  return gpuName
    .replace(/GeForce\s+/i, "")
    .replace(/\s+Laptop\s+GPU/i, "")
    .replace(/\s+with\s+Max-Q\s+Design/i, "")
    .replace(/\s+Graphics/i, "")
    .trim();
}

/**
 * Clean up verbose CPU strings and append thread count if provided.
 * e.g., "AMD Ryzen 7 6800HS with Radeon Graphics" -> "AMD Ryzen 7 6800HS (16T)"
 */
export function formatCpuModel(
  cpuModel?: string | null,
  logicalCores?: number | null
): string {
  if (!cpuModel) return "Unknown CPU";

  let clean = cpuModel
    .replace(/\s+with\s+Radeon\s+Graphics/i, "")
    .replace(/\s+16-Core\s+Processor/i, "")
    .replace(/\s+8-Core\s+Processor/i, "")
    .replace(/\s+Processor/i, "")
    .trim();

  if (logicalCores && logicalCores > 0) {
    clean = `${clean} (${logicalCores}T)`;
  }

  return clean;
}

/**
 * Calculate disk used percentage (0 - 100)
 */
export function calculateDiskUsagePercent(
  freeBytes?: number,
  totalBytes?: number
): number {
  if (!totalBytes || totalBytes <= 0 || freeBytes === undefined || freeBytes === null) {
    return 0;
  }
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const percent = Math.round((usedBytes / totalBytes) * 100);
  return Math.min(100, Math.max(0, percent));
}
