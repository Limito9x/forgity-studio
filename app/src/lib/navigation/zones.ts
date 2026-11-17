import { useAuthStore } from "@/stores/authStore";

export type AppZone = "local" | "studio" | "admin" | "templates";

export function resolveZoneFromPathname(pathname: string): AppZone {
  if (pathname.startsWith("/local") || pathname.startsWith("/workspaces")) return "local";
  if (pathname.startsWith("/templates")) return "templates";
  if (pathname.startsWith("/admin")) return "admin";
  return "studio";
}

/**
 * Các tiền tố quyền hạn dành riêng cho Platform Admin.
 * Lưu ý: backend System module sử dụng "system-studios:", "auditlogs:", "systemsettings:"
 * Identity module sử dụng "users:", "roles:".
 */
const ADMIN_PERMISSION_PREFIXES = [
  "system-studios:",
  "users:",
  "roles:",
  "auditlogs:",
  "systemsettings:",
];

export function hasAnyAdminPermission(
  hasAnyPermission: (prefix: string) => boolean
): boolean {
  return ADMIN_PERMISSION_PREFIXES.some((prefix) => hasAnyPermission(prefix));
}

export function useHasAnyAdminPermission(): boolean {
  const accessToken = useAuthStore((s) => s.accessToken);
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  if (!accessToken) return false;
  return hasAnyAdminPermission(hasAnyPermission);
}
