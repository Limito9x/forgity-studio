import { useEffect } from "react";
import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { getAuthState, useAuthStore } from "@/stores/authStore";
import { useGetProfile } from "@/features/settings/hooks/useProfile";
import { useGetPermissions } from "@/gen/endpoints/auth/auth";
import { useStudios } from "@/features/studios/hooks/useStudios";
import { setCurrentStudio, getCurrentStudioSlug } from "@/features/studios/hooks/useCurrentStudio";
import { AppSplashScreen } from "@/components/layout/app/AppSplashScreen";
import { ServerTroubleScreen } from "@/components/layout/app/ServerTroubleScreen";

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

  const {
    data: profile,
    isLoading: isProfileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useGetProfile();

  const {
    data: permissions,
    isLoading: isPermissionsLoading,
    error: permissionsError,
    refetch: refetchPermissions,
  } = useGetPermissions();

  const {
    data: studios,
    isLoading: isStudiosLoading,
    error: studiosError,
    isError: isStudiosError,
    refetch: refetchStudios,
  } = useStudios();

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

  // Studio Guard: Chỉ chạy khi API thành công, TUYỆT ĐỐI không chạy khi server gặp lỗi kết nối!
  useEffect(() => {
    if (isStudiosLoading || isStudiosError) return;

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
  }, [isStudiosLoading, isStudiosError, studios, pathname, navigate]);

  const isInitialLoading = isProfileLoading || isPermissionsLoading || isStudiosLoading;

  if (isInitialLoading) {
    return <AppSplashScreen message="Initializing workspace..." />;
  }

  // Fallback sang ServerTroubleScreen khi server gặp trục trặc kết nối
  const hasServerTrouble = Boolean(studiosError || profileError || permissionsError);
  if (hasServerTrouble) {
    return (
      <ServerTroubleScreen
        onRetry={async () => {
          await Promise.all([
            refetchStudios(),
            refetchProfile(),
            refetchPermissions(),
          ]);
        }}
      />
    );
  }

  // Chuyển tiếp êm dịu sang onboarding nếu chưa có studio (chỉ khi API đã trả về thành công 200 mảng rỗng)
  if (!isStudiosLoading && !isStudiosError && studios?.length === 0 && pathname !== "/onboarding") {
    return <AppSplashScreen message="Setting up your environment..." />;
  }

  return <Outlet />;
}
