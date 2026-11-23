import { createFileRoute, redirect } from "@tanstack/react-router";

// Solo-First Desktop (ADR-011): Studio Cloud zone is retired; route directly to Local Workspace.
export const Route = createFileRoute("/_protected/_layout/studio/")({
  beforeLoad: () => {
    throw redirect({ to: "/local", replace: true });
  },
  component: () => null,
});
