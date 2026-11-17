import { createFileRoute } from "@tanstack/react-router";
import { WorkspacesPage } from "@/features/pipelines/pages/WorkspacesPage";

export const Route = createFileRoute("/_protected/_layout/workspaces/")({
  staticData: { breadcrumb: "Workspaces" },
  component: () => <WorkspacesPage />,
});
