import { createFileRoute } from "@tanstack/react-router";
import { RunnerDetailPage } from "@/features/runners/pages/RunnerDetailPage";

export const Route = createFileRoute("/_protected/_layout/runners_/$runnerId")({
  staticData: {
    breadcrumb: "Runner Details",
  },
  component: RunnerDetailPageWrapper,
});

function RunnerDetailPageWrapper() {
  const { runnerId } = Route.useParams();
  return <RunnerDetailPage runnerId={runnerId} />;
}
