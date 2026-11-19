import { useCallback, useEffect, useState } from "react";
import { getProfile } from "@/gen/endpoints/profile/profile";
import { getPermissions } from "@/gen/endpoints/auth/auth";
import { useAuthStore } from "@/stores/authStore";
import { useAppModeStore } from "@/stores/appModeStore";

export type AuthBootstrapStatus = "idle" | "checking" | "authenticated" | "guest" | "offline";

const BOOTSTRAP_TIMEOUT_MS = 2500;

/**
 * Checks whether the stored accessToken is valid and hydrates profile + permissions.
 * Falls back cleanly to Guest (on 401) or Offline Local Mode (on network/timeout/5xx).
 */
export function useAuthBootstrap(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const accessToken = useAuthStore((s) => s.accessToken);
  const profile = useAuthStore((s) => s.profile);
  const isAuthBootstrapped = useAppModeStore((s) => s.isAuthBootstrapped);
  const isServerUnreachable = useAppModeStore((s) => s.isServerUnreachable);

  const [status, setStatus] = useState<AuthBootstrapStatus>(() => {
    if (!accessToken) return "guest";
    if (profile) return "authenticated";
    if (isServerUnreachable) return "offline";
    return "idle";
  });

  const runCheck = useCallback(async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) {
      useAppModeStore.getState().setServerUnreachable(false);
      useAppModeStore.getState().setAuthBootstrapped(true);
      setStatus("guest");
      return "guest" as const;
    }

    setStatus("checking");
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), BOOTSTRAP_TIMEOUT_MS);

    try {
      const [profileRes, permissionsRes] = await Promise.all([
        getProfile(controller.signal),
        getPermissions(controller.signal),
      ]);

      useAuthStore.getState().setProfile(profileRes);
      useAuthStore.getState().setPermissions((permissionsRes as unknown as string[]) ?? []);
      useAppModeStore.getState().setServerUnreachable(false);
      useAppModeStore.getState().setAuthBootstrapped(true);
      setStatus("authenticated");
      return "authenticated" as const;
    } catch (err: any) {
      const httpStatus = err?.response?.status;
      if (httpStatus === 401 || httpStatus === 403) {
        useAuthStore.getState().logout();
        useAppModeStore.getState().setServerUnreachable(false);
        useAppModeStore.getState().setAuthBootstrapped(true);
        setStatus("guest");
        return "guest" as const;
      }

      // Network error, timeout, or 5xx: keep token for later retry and fall back to Local Mode
      useAppModeStore.getState().setServerUnreachable(true);
      useAppModeStore.getState().setMode("local");
      useAppModeStore.getState().setAuthBootstrapped(true);
      setStatus("offline");
      return "offline" as const;
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!accessToken) {
      useAppModeStore.getState().setAuthBootstrapped(true);
      setStatus("guest");
      return;
    }
    if (profile) {
      useAppModeStore.getState().setAuthBootstrapped(true);
      setStatus("authenticated");
      return;
    }
    if (!isAuthBootstrapped) {
      void runCheck();
    }
  }, [enabled, accessToken, profile, isAuthBootstrapped, runCheck]);

  return {
    status,
    retry: runCheck,
  };
}
