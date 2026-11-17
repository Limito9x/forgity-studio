import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app/AppShell";

export const Route = createFileRoute("/local")({
  staticData: {
    breadcrumb: "Local",
  },
  component: LocalLayoutComponent,
});

function LocalLayoutComponent() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
