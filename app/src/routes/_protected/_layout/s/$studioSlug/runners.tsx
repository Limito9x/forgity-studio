import { createFileRoute } from "@tanstack/react-router";
import { RunnerPage } from "@/features/runners/RunnerPage";

export const Route = createFileRoute("/_protected/_layout/s/$studioSlug/runners")({
  component: StudioRunnersRoute,
});

function StudioRunnersRoute() {
  return <RunnerPage />;
}
