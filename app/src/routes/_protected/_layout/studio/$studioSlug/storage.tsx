import { createFileRoute } from "@tanstack/react-router";
import { StorageProfilesView } from "@/features/storageProfiles/components/StorageProfilesView";

export const Route = createFileRoute("/_protected/_layout/studio/$studioSlug/storage")({
  component: StudioStorageRoute,
});

function StudioStorageRoute() {
  return (
    <div className="page-container">
      <StorageProfilesView />
    </div>
  );
}
