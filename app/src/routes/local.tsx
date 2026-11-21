import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app/AppShell";
import { useAuthBootstrap } from "@/features/auth/hooks/useAuthBootstrap";

export const Route = createFileRoute("/local")({
  staticData: {
    breadcrumb: "Local",
  },
  component: LocalLayoutComponent,
});

function LocalLayoutComponent() {
  // Hydrate profile & permissions in background if user already has a token
  useAuthBootstrap();

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
