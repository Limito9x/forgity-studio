import { createFileRoute } from "@tanstack/react-router";
import { ProjectMigrationsPage } from "@/features/projects/pages/ProjectMigrationsPage";

export const Route = createFileRoute(
  "/_protected/_project/studio/$studioSlug/projects/$projectId/migrations"
)({
  staticData: {
    breadcrumb: "Migrations",
  },
  component: ProjectMigrationsPage,
});

