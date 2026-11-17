import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminTemplatesPage } from "@/features/system/components/templates/AdminTemplatesPage";
import { getAuthState } from "@/stores/authStore";

export const Route = createFileRoute("/_protected/_layout/admin/templates")({
  staticData: {
    breadcrumb: "Template Management",
  },
  beforeLoad: () => {
    const { hasAnyPermission } = getAuthState();
    const hasAdminAccess =
      hasAnyPermission("system-studios:") ||
      hasAnyPermission("users:") ||
      hasAnyPermission("roles:") ||
      hasAnyPermission("auditlogs:") ||
      hasAnyPermission("systemsettings:");

    if (!hasAdminAccess) {
      throw redirect({ to: "/403" });
    }
  },
  component: AdminTemplatesPage,
});
