import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppMode = "local" | "cloud";

interface AppModeState {
  mode: AppMode;
  lastLocalPath: string;
  lastCloudPath: string;
  setMode: (mode: AppMode) => void;
  recordPath: (pathname: string) => void;
}

export const useAppModeStore = create<AppModeState>()(
  persist(
    (set) => ({
      mode:
        typeof window !== "undefined" &&
        window.location.pathname.startsWith("/local")
          ? "local"
          : "cloud",
      lastLocalPath: "/local",
      lastCloudPath: "/",
      setMode: (mode) => set({ mode }),
      recordPath: (pathname) => {
        if (!pathname || pathname.startsWith("/auth")) return;
        if (pathname.startsWith("/local")) {
          set({ mode: "local", lastLocalPath: pathname });
        } else {
          set({ mode: "cloud", lastCloudPath: pathname });
        }
      },
    }),
    {
      name: "forgity_app_mode_v1",
    },
  ),
);
