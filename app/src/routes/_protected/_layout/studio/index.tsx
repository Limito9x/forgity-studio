import { createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentStudioSlug, setCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import { getStudios } from "@/gen/endpoints/studios/studios";

export const Route = createFileRoute("/_protected/_layout/studio/")({
  beforeLoad: async () => {
    let slug = getCurrentStudioSlug();
    if (!slug) {
      try {
        const studios = await getStudios();
        if (studios && studios.length > 0) {
          setCurrentStudio(studios[0]);
          slug = studios[0].slug;
        } else if (Array.isArray(studios) && studios.length === 0) {
          throw redirect({ to: "/onboarding" });
        }
      } catch (err) {
        if (err && typeof err === "object" && "to" in err) throw err;
        return;
      }
    }

    if (slug) {
      throw redirect({
        to: "/studio/$studioSlug",
        params: { studioSlug: slug },
        replace: true,
      });
    }
  },
  component: () => null,
});
