import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthState } from "@/stores/authStore";

export const Route = createFileRoute("/_protected/_layout/admin/")({
  beforeLoad: () => {
    const { hasAnyPermission } = getAuthState();
    if (hasAnyPermission("system-studios:")) throw redirect({ to: "/admin/studios", replace: true });
    if (hasAnyPermission("users:")) throw redirect({ to: "/admin/users", replace: true });
    if (hasAnyPermission("roles:")) throw redirect({ to: "/admin/roles", replace: true });
    if (hasAnyPermission("auditlogs:")) throw redirect({ to: "/admin/audit-logs", replace: true });
    if (hasAnyPermission("systemsettings:")) throw redirect({ to: "/admin/settings", replace: true });
    throw redirect({ to: "/403", replace: true });
  },
  component: () => null,
});
