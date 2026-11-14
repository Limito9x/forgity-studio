import { createFileRoute } from "@tanstack/react-router";
import { RunnerPage } from "@/features/runners/RunnerPage";

export const Route = createFileRoute("/_protected/_layout/runners")({
  component: RunnersRoute,
});

function RunnersRoute() {
  return <RunnerPage />;
}
