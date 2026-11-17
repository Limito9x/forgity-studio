import { createFileRoute, redirect } from "@tanstack/react-router";
import { SystemStudiosPage } from "@/features/system/components/studios/SystemStudiosPage";
import { getAuthState } from "@/stores/authStore";

export const Route = createFileRoute("/_protected/_layout/admin/studios")({
  staticData: {
    breadcrumb: "Studios",
  },
  beforeLoad: () => {
    const { hasAnyPermission } = getAuthState();
    if (!hasAnyPermission("system-studios:")) {
      throw redirect({ to: "/403" });
    }
  },
  component: SystemStudiosPage,
});

