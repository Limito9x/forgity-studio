import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StudioState {
  activeStudioId: string | null;
  setActiveStudioId: (id: string | null) => void;
}

export const useStudioStore = create<StudioState>()(
  persist(
    (set) => ({
      activeStudioId: null,
      setActiveStudioId: (id) => set({ activeStudioId: id }),
    }),
    {
      name: "automation_active_studio",
    }
  )
);
