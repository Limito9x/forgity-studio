import { useEffect } from "react";
import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { getAuthState, useAuthStore } from "@/stores/authStore";
import { useAppModeStore } from "@/stores/appModeStore";
import { useGetProfile } from "@/features/settings/hooks/useProfile";
import { useGetPermissions } from "@/gen/endpoints/auth/auth";
import { AppSplashScreen } from "@/components/layout/app/AppSplashScreen";

export const Route = createFileRoute("/_protected")({
  beforeLoad: ({ location }) => {
    if (!getAuthState().accessToken) {
      throw redirect({
        to: "/auth/login",
        search: () => ({ redirect: location.href }),
      });
    }
  },
  component: ProtectedLayoutComponent,
});

function ProtectedLayoutComponent() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError,
  } = useGetProfile();

  const {
    data: permissions,
    isLoading: isPermissionsLoading,
    error: permissionsError,
  } = useGetPermissions();

  const setProfile = useAuthStore((state) => state.setProfile);
  const setPermissions = useAuthStore((state) => state.setPermissions);

  useEffect(() => {
    if (profile) {
      setProfile(profile);
    }
  }, [profile, setProfile]);

  useEffect(() => {
    if (permissions) {
      setPermissions(permissions as unknown as string[]);
    }
  }, [permissions, setPermissions]);

  const isInitialLoading = isProfileLoading || isPermissionsLoading;
  const hasServerTrouble = Boolean(profileError || permissionsError);
  const isLocalWorkspaceRoute = pathname.startsWith("/workspaces");

  // Fallback automatically to Local Mode when Cloud server is unreachable
  useEffect(() => {
    if (!isInitialLoading && hasServerTrouble && !isLocalWorkspaceRoute) {
      useAppModeStore.getState().setMode("local");
      toast.info("Cloud server unreachable — continuing in Local Mode.");
      navigate({ to: "/local", replace: true });
    }
  }, [isInitialLoading, hasServerTrouble, isLocalWorkspaceRoute, navigate]);

  if (isInitialLoading && !isLocalWorkspaceRoute) {
    return <AppSplashScreen message="Initializing workspace..." />;
  }

  if (hasServerTrouble && !isLocalWorkspaceRoute) {
    return <AppSplashScreen message="Switching to Local Mode..." />;
  }

  return <Outlet />;
}
