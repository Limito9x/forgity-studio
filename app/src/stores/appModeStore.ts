import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppMode = "local" | "cloud";

interface AppModeState {
  mode: AppMode;
  lastLocalPath: string;
  lastCloudPath: string;
  isServerUnreachable: boolean;
  isAuthBootstrapped: boolean;
  setMode: (mode: AppMode) => void;
  setServerUnreachable: (val: boolean) => void;
  setAuthBootstrapped: (val: boolean) => void;
  recordPath: (pathname: string) => void;
}

export const useAppModeStore = create<AppModeState>()(
  persist(
    (set) => ({
      mode: "local",
      lastLocalPath: "/local",
      lastCloudPath: "/templates",
      isServerUnreachable: false,
      isAuthBootstrapped: false,
      setMode: (mode) => set({ mode }),
      setServerUnreachable: (val) => set({ isServerUnreachable: val }),
      setAuthBootstrapped: (val) => set({ isAuthBootstrapped: val }),
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
      partialize: (state) => ({
        mode: state.mode,
        lastLocalPath: state.lastLocalPath,
        lastCloudPath: state.lastCloudPath,
      }),
    },
  ),
);
