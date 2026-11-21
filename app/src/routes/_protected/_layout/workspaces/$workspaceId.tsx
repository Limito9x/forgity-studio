import { createFileRoute } from "@tanstack/react-router";
import { LocalWorkspacePage } from "@/features/pipelines/pages/LocalWorkspacePage";
import { useWorkspaceRegistry } from "@/features/pipelines/hooks/workspace/useWorkspaceRegistry";

export const Route = createFileRoute("/_protected/_layout/workspaces/$workspaceId")({
  staticData: { breadcrumb: "Workspace Editor" },
  component: WorkspaceDetailRoute,
});

function WorkspaceDetailRoute() {
  const { workspaceId } = Route.useParams();
  const { workspaces, isLoading } = useWorkspaceRegistry();
  const current = workspaces.find((w) => w.id === workspaceId);

  if (isLoading && !current) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading workspace...
      </div>
    );
  }

  return (
    <LocalWorkspacePage
      projectId={workspaceId}
      explicitRootPath={current?.rootPath || null}
    />
  );
}
