import { createFileRoute, Outlet } from "@tanstack/react-router";
import { LocalShell } from "@/components/layout/app/LocalShell";

export const Route = createFileRoute("/local")({
  staticData: {
    breadcrumb: "Local",
  },
  component: LocalLayoutComponent,
});

function LocalLayoutComponent() {
  return (
    <LocalShell>
      <Outlet />
    </LocalShell>
  );
}
