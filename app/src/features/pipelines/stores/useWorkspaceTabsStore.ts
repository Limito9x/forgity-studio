import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceTabKind = "pipeline" | "palette" | "structs" | "constants";

export interface WorkspaceTabViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface WorkspaceTab {
  id: string;
  kind: WorkspaceTabKind;
  title: string;
  filePath?: string;
  pipelineKind?: "component" | "master";
  executor?: string;
  viewport?: WorkspaceTabViewport;
}

interface ProjectWorkbenchState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  isOutlinerCollapsed: boolean;
}

interface WorkspaceTabsStoreState {
  byProject: Record<string, ProjectWorkbenchState>;
  paletteScanRequest: number;
  paletteInitialScriptKey?: string;
  getProjectState: (projectId: string) => ProjectWorkbenchState;
  requestPaletteScan: (projectId: string, scriptKey?: string) => void;
  openPipelineTab: (
    projectId: string,
    draft: {
      fullPath: string;
      fileName: string;
      pipelineKind?: "component" | "master";
      executor?: string;
    },
  ) => void;
  openSingletonTab: (
    projectId: string,
    kind: "palette" | "structs" | "constants",
  ) => void;
  closeTab: (projectId: string, tabId: string) => void;
  setActiveTab: (projectId: string, tabId: string) => void;
  toggleOutliner: (projectId: string) => void;
  setOutlinerCollapsed: (projectId: string, collapsed: boolean) => void;
  updateTabViewport: (
    projectId: string,
    tabId: string,
    viewport: WorkspaceTabViewport,
  ) => void;
}

const DEFAULT_PROJECT_STATE: ProjectWorkbenchState = {
  tabs: [],
  activeTabId: null,
  isOutlinerCollapsed: false,
};

const SINGLETON_META: Record<
  "palette" | "structs" | "constants",
  { id: string; title: string }
> = {
  palette: { id: "singleton:palette", title: "Node Palette" },
  structs: { id: "singleton:structs", title: "Structs" },
  constants: { id: "singleton:constants", title: "Constants" },
};

export const useWorkspaceTabsStore = create<WorkspaceTabsStoreState>()(
  persist(
    (set, get) => ({
      byProject: {},
      paletteScanRequest: 0,
      paletteInitialScriptKey: undefined,

      requestPaletteScan: (projectId, scriptKey) => {
        get().openSingletonTab(projectId, "palette");
        set((state) => ({
          paletteScanRequest: state.paletteScanRequest + 1,
          paletteInitialScriptKey: scriptKey,
        }));
      },

      getProjectState: (projectId: string) => {
        return get().byProject[projectId] || DEFAULT_PROJECT_STATE;
      },

      openPipelineTab: (projectId, draft) => {
        set((state) => {
          const current = state.byProject[projectId] || DEFAULT_PROJECT_STATE;
          const existing = current.tabs.find(
            (t) => t.kind === "pipeline" && t.filePath === draft.fullPath,
          );
          if (existing) {
            return {
              byProject: {
                ...state.byProject,
                [projectId]: {
                  ...current,
                  activeTabId: existing.id,
                },
              },
            };
          }

          const title = draft.fileName.replace(
            /\.(pipeline|component)\.(yaml|yml)$/i,
            "",
          );
          const newTab: WorkspaceTab = {
            id: `pipeline:${draft.fullPath}`,
            kind: "pipeline",
            title,
            filePath: draft.fullPath,
            pipelineKind: draft.pipelineKind,
            executor: draft.executor,
          };

          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                tabs: [...current.tabs, newTab],
                activeTabId: newTab.id,
              },
            },
          };
        });
      },

      openSingletonTab: (projectId, kind) => {
        const meta = SINGLETON_META[kind];
        set((state) => {
          const current = state.byProject[projectId] || DEFAULT_PROJECT_STATE;
          const existing = current.tabs.find((t) => t.id === meta.id);
          if (existing) {
            return {
              byProject: {
                ...state.byProject,
                [projectId]: {
                  ...current,
                  activeTabId: existing.id,
                },
              },
            };
          }

          const newTab: WorkspaceTab = {
            id: meta.id,
            kind,
            title: meta.title,
          };

          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                tabs: [...current.tabs, newTab],
                activeTabId: newTab.id,
              },
            },
          };
        });
      },

      closeTab: (projectId, tabId) => {
        set((state) => {
          const current = state.byProject[projectId] || DEFAULT_PROJECT_STATE;
          const idx = current.tabs.findIndex((t) => t.id === tabId);
          if (idx === -1) return state;

          const nextTabs = current.tabs.filter((t) => t.id !== tabId);
          let nextActiveId = current.activeTabId;
          if (current.activeTabId === tabId) {
            const fallback = nextTabs[idx] || nextTabs[idx - 1] || null;
            nextActiveId = fallback ? fallback.id : null;
          }

          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                tabs: nextTabs,
                activeTabId: nextActiveId,
              },
            },
          };
        });
      },

      setActiveTab: (projectId, tabId) => {
        set((state) => {
          const current = state.byProject[projectId] || DEFAULT_PROJECT_STATE;
          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                activeTabId: tabId,
              },
            },
          };
        });
      },

      toggleOutliner: (projectId) => {
        set((state) => {
          const current = state.byProject[projectId] || DEFAULT_PROJECT_STATE;
          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                isOutlinerCollapsed: !current.isOutlinerCollapsed,
              },
            },
          };
        });
      },

      setOutlinerCollapsed: (projectId, collapsed) => {
        set((state) => {
          const current = state.byProject[projectId] || DEFAULT_PROJECT_STATE;
          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                isOutlinerCollapsed: collapsed,
              },
            },
          };
        });
      },

      updateTabViewport: (projectId, tabId, viewport) => {
        set((state) => {
          const current = state.byProject[projectId] || DEFAULT_PROJECT_STATE;
          return {
            byProject: {
              ...state.byProject,
              [projectId]: {
                ...current,
                tabs: current.tabs.map((t) =>
                  t.id === tabId ? { ...t, viewport } : t,
                ),
              },
            },
          };
        });
      },
    }),
    {
      name: "forgity:workspace-workbench:v1",
      partialize: (state) => ({
        byProject: state.byProject,
      }),
    },
  ),
);

