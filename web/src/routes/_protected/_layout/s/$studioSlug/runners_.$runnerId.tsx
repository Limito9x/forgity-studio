import { createFileRoute } from "@tanstack/react-router";
import { RunnerDetailPage } from "@/features/runners/pages/RunnerDetailPage";

export const Route = createFileRoute(
  "/_protected/_layout/s/$studioSlug/runners_/$runnerId"
)({
  staticData: {
    breadcrumb: "Runner Details",
  },
  component: StudioRunnerDetailPageWrapper,
});

function StudioRunnerDetailPageWrapper() {
  const { runnerId } = Route.useParams();
  return <RunnerDetailPage runnerId={runnerId} />;
}
