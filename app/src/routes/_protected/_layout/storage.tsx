import { createFileRoute } from "@tanstack/react-router";
import { StorageProfilesView } from "@/features/storageProfiles/components/StorageProfilesView";

export const Route = createFileRoute("/_protected/_layout/storage")({
  component: StorageRoute,
});

function StorageRoute() {
  return (
    <div className="page-container">
      <StorageProfilesView />
    </div>
  );
}
