import { createFileRoute } from "@tanstack/react-router";
import { TemplatesCatalogPage } from "@/features/pipelines/pages/templates/TemplatesCatalogPage";

export const Route = createFileRoute("/_protected/_layout/templates/")({
  staticData: { breadcrumb: "Templates" },
  component: () => <TemplatesCatalogPage />,
});
