import { createFileRoute } from "@tanstack/react-router";
import { SystemStudiosPage } from "@/features/system/components/studios/SystemStudiosPage";

export const Route = createFileRoute("/_protected/_layout/system/studios")({
  component: SystemStudiosPage,
});

