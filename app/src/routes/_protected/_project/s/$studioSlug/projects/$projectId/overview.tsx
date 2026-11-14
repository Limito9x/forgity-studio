import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_protected/_project/s/$studioSlug/projects/$projectId/overview"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/s/$studioSlug/projects/$projectId/pipeline",
      params: { studioSlug: params.studioSlug, projectId: params.projectId },
    });
  },
  component: () => null,
});