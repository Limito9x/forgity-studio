import { createFileRoute } from "@tanstack/react-router";
import { TemplateWorkbenchPage } from "@/features/pipelines/pages/templates/TemplateWorkbenchPage";

export const Route = createFileRoute("/_protected/_layout/templates/library/$libraryItemId")({
  staticData: { breadcrumb: "Workbench" },
  component: TemplateWorkbenchRoute,
});

function TemplateWorkbenchRoute() {
  const { libraryItemId } = Route.useParams();
  return <TemplateWorkbenchPage libraryItemId={libraryItemId} />;
}
