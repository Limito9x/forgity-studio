import { createFileRoute } from "@tanstack/react-router";
import { LocalWorkspacePage } from "@/features/pipelines/pages/LocalWorkspacePage";

export const Route = createFileRoute("/local/")({
  staticData: {
    breadcrumb: "Workspace",
  },
  component: LocalWorkspaceRoute,
});

function LocalWorkspaceRoute() {
  return <LocalWorkspacePage projectId="local-default" />;
}
