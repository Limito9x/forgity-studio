import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppSplashScreen } from "@/components/layout/app/AppSplashScreen";
import { useAuthBootstrap } from "@/features/auth/hooks/useAuthBootstrap";
import { useAppModeStore } from "@/stores/appModeStore";
import { useAuthStore } from "@/stores/authStore";

export const Route = createFileRoute("/")({
  component: StartupGate,
});

function StartupGate() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { status } = useAuthBootstrap({ enabled: Boolean(accessToken) });

  useEffect(() => {
    if (!accessToken || status === "guest") {
      useAppModeStore.getState().setMode("local");
      navigate({ to: "/local", replace: true });
      return;
    }

    if (status === "authenticated") {
      const { mode, lastCloudPath, lastLocalPath } = useAppModeStore.getState();
      const target =
        mode === "cloud"
          ? lastCloudPath && lastCloudPath !== "/"
            ? lastCloudPath
            : "/templates"
          : lastLocalPath || "/local";
      navigate({ to: target as any, replace: true });
      return;
    }

    if (status === "offline") {
      toast.info("Cloud server unreachable — continuing in Local Mode.");
      navigate({ to: "/local", replace: true });
    }
  }, [accessToken, status, navigate]);

  return <AppSplashScreen message="Connecting to Forgity..." />;
}
