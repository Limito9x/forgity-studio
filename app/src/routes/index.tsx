import { createFileRoute, redirect } from "@tanstack/react-router";
import { getAuthState } from "@/stores/authStore";
import { useAppModeStore } from "@/stores/appModeStore";
import { getCurrentStudioSlug } from "@/features/studios/hooks/useCurrentStudio";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    const token = getAuthState().accessToken;
    const mode = useAppModeStore.getState().mode;

    if (!token || mode === "local") {
      throw redirect({ to: "/local", replace: true });
    }

    const slug = getCurrentStudioSlug();
    if (slug) {
      throw redirect({
        to: "/studio/$studioSlug",
        params: { studioSlug: slug },
        replace: true,
      });
    }

    throw redirect({ to: "/studio", replace: true });
  },
  component: () => null,
});
