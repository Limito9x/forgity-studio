import { useEffect } from "react";
import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { getAuthState, useAuthStore } from "@/stores/authStore";
import { useAppModeStore } from "@/stores/appModeStore";
import { useGetProfile } from "@/features/settings/hooks/useProfile";
import { useGetPermissions } from "@/gen/endpoints/auth/auth";
import { useStudios } from "@/features/studios/hooks/useStudios";
import { setCurrentStudio, getCurrentStudioSlug } from "@/features/studios/hooks/useCurrentStudio";
import { AppSplashScreen } from "@/components/layout/app/AppSplashScreen";

export const Route = createFileRoute("/_protected")({
  beforeLoad: ({ location }) => {
    if (!getAuthState().accessToken) {
      if (useAppModeStore.getState().mode === "local") {
        throw redirect({ to: "/local", replace: true });
      }
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

  const {
    data: studios,
    isLoading: isStudiosLoading,
    error: studiosError,
    isError: isStudiosError,
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

  const hasServerTrouble = Boolean(studiosError || profileError || permissionsError);

  // Fallback tự động sang Local Mode (Guest/Offline) khi không kết nối được tới Cloud server
  useEffect(() => {
    if (!isInitialLoading && hasServerTrouble) {
      useAppModeStore.getState().setMode("local");
      toast.info("Cloud server unreachable — continuing in Local Mode.");
      navigate({ to: "/local", replace: true });
    }
  }, [isInitialLoading, hasServerTrouble, navigate]);

  if (isInitialLoading) {
    return <AppSplashScreen message="Initializing workspace..." />;
  }

  if (hasServerTrouble) {
    return <AppSplashScreen message="Switching to Local Mode..." />;
  }

  // Chuyển tiếp êm dịu sang onboarding nếu chưa có studio (chỉ khi API đã trả về thành công 200 mảng rỗng)
  if (!isStudiosLoading && !isStudiosError && studios?.length === 0 && pathname !== "/onboarding") {
    return <AppSplashScreen message="Setting up your environment..." />;
  }

  return <Outlet />;
}
