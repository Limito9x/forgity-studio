import { create } from "zustand";
import type React from "react";

export interface ToolItem {
    id: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    panel?: React.ComponentType | null;
    order?: number;
    badge?: string | number;
}

interface ProjectToolbarStore {
    tools: ToolItem[];
    activePanelId: string | null;
    isCollapsed: boolean;
    isDragging: boolean;
    registerTool: (tool: ToolItem) => void;
    unregisterTool: (id: string) => void;
    togglePanel: (id: string) => void;
    openPanel: (id: string) => void;
    closePanel: () => void;
    toggleCollapse: () => void;
    setCollapsed: (collapsed: boolean) => void;
    setIsDragging: (isDragging: boolean) => void;
}

export const useProjectToolbarStore = create<ProjectToolbarStore>((set) => ({
    tools: [],
    activePanelId: null,
    isCollapsed: false,
    isDragging: false,
    registerTool: (tool) =>
        set((state) => {
            const filtered = state.tools.filter((t) => t.id !== tool.id);
            const nextTools = [...filtered, tool].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            return { tools: nextTools };
        }),
    unregisterTool: (id) =>
        set((state) => ({
            tools: state.tools.filter((t) => t.id !== id),
            activePanelId: state.activePanelId === id ? null : state.activePanelId,
        })),
    togglePanel: (id) =>
        set((state) => ({
            activePanelId: state.activePanelId === id ? null : id,
            isCollapsed: false, // Reset collapse state when opening/toggling
        })),
    openPanel: (id) => set({ activePanelId: id, isCollapsed: false }),
    closePanel: () => set({ activePanelId: null, isCollapsed: false }),
    toggleCollapse: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
    setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
    setIsDragging: (isDragging) => set({ isDragging }),
}));
