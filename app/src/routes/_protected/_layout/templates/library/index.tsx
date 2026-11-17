import { createFileRoute } from "@tanstack/react-router";
import { MyLibraryPage } from "@/features/pipelines/pages/templates/MyLibraryPage";

export const Route = createFileRoute("/_protected/_layout/templates/library/")({
  staticData: { breadcrumb: "My Library" },
  component: () => <MyLibraryPage />,
});
