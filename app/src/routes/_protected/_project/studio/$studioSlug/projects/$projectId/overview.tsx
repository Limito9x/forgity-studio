import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_protected/_project/studio/$studioSlug/projects/$projectId/overview"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/studio/$studioSlug/projects/$projectId/pipeline",
      params: { studioSlug: params.studioSlug, projectId: params.projectId },
    });
  },
  component: () => null,
});