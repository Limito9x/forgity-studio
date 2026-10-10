import { useEffect } from "react";
import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { getAuthState, useAuthStore } from "@/stores/authStore";
import { useGetProfile } from "@/features/settings/hooks/useProfile";
import { useGetPermissions } from "@/gen/endpoints/auth/auth";
import { useStudios } from "@/features/studios/hooks/useStudios";
import { setCurrentStudio, getCurrentStudioSlug } from "@/features/studios/hooks/useCurrentStudio";
import { AppSplashScreen } from "@/components/layout/app/AppSplashScreen";

export const Route = createFileRoute("/_protected")({
  beforeLoad: ({ location }) => {
    if (!getAuthState().accessToken) {
      throw redirect({
        to: "/auth/login",
        search: () => ({ redirect: location.href }),
      })
    }
  },
  component: ProtectedLayoutComponent,
});

function ProtectedLayoutComponent() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: profile, isLoading: isProfileLoading } = useGetProfile();
  const { data: permissions, isLoading: isPermissionsLoading } = useGetPermissions();
  const { data: studios, isLoading: isStudiosLoading } = useStudios();

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

  // Studio Guard
  useEffect(() => {
    if (isStudiosLoading) return;

    const studioList = studios ?? [];
    const isOnboardingPage = pathname === "/onboarding";

    if (studioList.length === 0) {
      if (!isOnboardingPage) {
        navigate({ to: "/onboarding", replace: true });
      }
    } else {
      if (isOnboardingPage) {
        navigate({ to: "/", replace: true });
      } else {
        const lastSlug = getCurrentStudioSlug();
        const active = studioList.find((s) => s.slug === lastSlug) ?? studioList[0];
        setCurrentStudio(active);
      }
    }
  }, [isStudiosLoading, studios, pathname, navigate]);

  const isInitialLoading = isProfileLoading || isPermissionsLoading || isStudiosLoading;

  if (isInitialLoading) {
    return <AppSplashScreen message="Initializing workspace..." />;
  }

  // Chuyển tiếp êm dịu sang onboarding nếu chưa có studio
  if (!isStudiosLoading && (!studios || studios.length === 0) && pathname !== "/onboarding") {
    return <AppSplashScreen message="Setting up your environment..." />;
  }

  return <Outlet />;
}
