import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type OutlinerSectionKey = "componentPipes" | "masterPipelines" | "palette";
export type CanvasViewMode = "visual" | "yaml";
export type PaletteDeckFilter = "all" | "new" | "modified";
export type PaletteDeckTab = "pins" | "code" | "impact";

export interface ProjectUiPrefs {
  sidebarCollapsed: boolean;
  sections: Record<OutlinerSectionKey, boolean>;
  canvasViewMode: CanvasViewMode;
  paletteDeck: {
    filter: PaletteDeckFilter;
    activeTab: PaletteDeckTab;
  };
}

const DEFAULT_PROJECT_PREFS: ProjectUiPrefs = {
  sidebarCollapsed: false,
  sections: {
    componentPipes: true,
    masterPipelines: true,
    palette: true,
  },
  canvasViewMode: "visual",
  paletteDeck: {
    filter: "all",
    activeTab: "pins",
  },
};

function readLegacyCollapsed(projectId: string): boolean | undefined {
  try {
    const raw = localStorage.getItem("forgity:workspace-workbench:v1");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    const val = parsed?.state?.byProject?.[projectId]?.isOutlinerCollapsed;
    return typeof val === "boolean" ? val : undefined;
  } catch {
    return undefined;
  }
}

interface WorkspaceUiPrefsStoreState {
  byProject: Record<string, ProjectUiPrefs>;
  getPrefs: (projectId: string) => ProjectUiPrefs;
  toggleSidebar: (projectId: string) => void;
  setSidebarCollapsed: (projectId: string, collapsed: boolean) => void;
  toggleSection: (projectId: string, section: OutlinerSectionKey) => void;
  setSectionExpanded: (
    projectId: string,
    section: OutlinerSectionKey,
    expanded: boolean,
  ) => void;
  setCanvasViewMode: (projectId: string, mode: CanvasViewMode) => void;
  setPaletteDeckPrefs: (
    projectId: string,
    patch: Partial<ProjectUiPrefs["paletteDeck"]>,
  ) => void;
}

function mergePrefs(
  existing: ProjectUiPrefs | undefined,
  projectId: string,
): ProjectUiPrefs {
  if (existing) {
    return {
      ...DEFAULT_PROJECT_PREFS,
      ...existing,
      sections: {
        ...DEFAULT_PROJECT_PREFS.sections,
        ...(existing.sections || {}),
      },
      paletteDeck: {
        ...DEFAULT_PROJECT_PREFS.paletteDeck,
        ...(existing.paletteDeck || {}),
      },
    };
  }
  const legacyCollapsed = readLegacyCollapsed(projectId);
  return {
    ...DEFAULT_PROJECT_PREFS,
    sidebarCollapsed: legacyCollapsed ?? DEFAULT_PROJECT_PREFS.sidebarCollapsed,
  };
}

export const useWorkspaceUiPrefsStore = create<WorkspaceUiPrefsStoreState>()(
  persist(
    (set, get) => ({
      byProject: {},

      getPrefs: (projectId) => {
        return mergePrefs(get().byProject[projectId], projectId);
      },

      toggleSidebar: (projectId) => {
        set((state) => {
          const current = mergePrefs(state.byProject[projectId], projectId);
          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                sidebarCollapsed: !current.sidebarCollapsed,
              },
            },
          };
        });
      },

      setSidebarCollapsed: (projectId, collapsed) => {
        set((state) => {
          const current = mergePrefs(state.byProject[projectId], projectId);
          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                sidebarCollapsed: collapsed,
              },
            },
          };
        });
      },

      toggleSection: (projectId, section) => {
        set((state) => {
          const current = mergePrefs(state.byProject[projectId], projectId);
          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                sections: {
                  ...current.sections,
                  [section]: !current.sections[section],
                },
              },
            },
          };
        });
      },

      setSectionExpanded: (projectId, section, expanded) => {
        set((state) => {
          const current = mergePrefs(state.byProject[projectId], projectId);
          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                sections: {
                  ...current.sections,
                  [section]: expanded,
                },
              },
            },
          };
        });
      },

      setCanvasViewMode: (projectId, mode) => {
        set((state) => {
          const current = mergePrefs(state.byProject[projectId], projectId);
          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                canvasViewMode: mode,
              },
            },
          };
        });
      },

      setPaletteDeckPrefs: (projectId, patch) => {
        set((state) => {
          const current = mergePrefs(state.byProject[projectId], projectId);
          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                paletteDeck: {
                  ...current.paletteDeck,
                  ...patch,
                },
              },
            },
          };
        });
      },
    }),
    {
      name: "forgity:workspace-ui-prefs:v1",
      version: 1,
    },
  ),
);

export function useProjectUiPrefs(projectId: string): ProjectUiPrefs {
  const raw = useWorkspaceUiPrefsStore((s) => s.byProject[projectId]);
  return useMemo(() => mergePrefs(raw, projectId), [raw, projectId]);
}

