import { createFileRoute } from "@tanstack/react-router";
import { TemplatePreviewPage } from "@/features/pipelines/pages/templates/TemplatePreviewPage";

export const Route = createFileRoute("/_protected/_layout/templates/$templateId")({
  staticData: { breadcrumb: "Preview" },
  component: TemplatePreviewRoute,
});

function TemplatePreviewRoute() {
  const { templateId } = Route.useParams();
  return <TemplatePreviewPage templateId={templateId} />;
}
