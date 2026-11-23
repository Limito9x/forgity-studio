import { createFileRoute, redirect } from "@tanstack/react-router";

// Solo-First Desktop (ADR-011): Studio onboarding is retired; route directly to Local Workspace.
export const Route = createFileRoute("/_protected/onboarding")({
  beforeLoad: () => {
    throw redirect({ to: "/local", replace: true });
  },
  component: () => null,
});
