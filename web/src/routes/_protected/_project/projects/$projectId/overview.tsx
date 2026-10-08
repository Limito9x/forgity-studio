import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_protected/_project/projects/$projectId/overview"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/pipeline",
      params: { projectId: params.projectId },
    });
  },
  component: () => null,
});