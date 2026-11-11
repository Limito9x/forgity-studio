import { create } from "zustand";
import { get, set } from "idb-keyval";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import type {
  ForgityWorkspaceConfig,
  LocalDraftNode,
  ScannedPipelineYamlItemRust,
  ScannedScriptItemRust,
  ScriptFolderConfig,
  ScriptScanSummary,
  StagedScriptItem,
  ScriptSyncStatus,
} from "../types/workspaceConfig";

const WORKSPACE_CONFIG_KEY = (projectId: string) => `forgity:workspace_config:${projectId}`;
const DRAFT_NODES_KEY = (projectId: string) => `forgity:local_draft_nodes:${projectId}`;
const SCAN_SUMMARY_KEY = (projectId: string) => `forgity:scan_summary:${projectId}`;

interface LocalWorkspaceState {
  projectId: string | null;
  config: ForgityWorkspaceConfig | null;
  draftNodes: Record<string, LocalDraftNode>;
  scannedDraftPipelines: ScannedPipelineYamlItemRust[];
  activeDraftPipeline: ScannedPipelineYamlItemRust | null;
  scanSummary: ScriptScanSummary | null;
  isScanning: boolean;
  isLoading: boolean;
  lastError: string | null;

  // Actions
  initWorkspace: (projectId: string) => Promise<void>;
  updateConfig: (updater: (prev: ForgityWorkspaceConfig) => ForgityWorkspaceConfig) => Promise<void>;
  addScriptFolder: (folder: ScriptFolderConfig) => Promise<void>;
  removeScriptFolder: (path: string) => Promise<void>;
  toggleScriptFolder: (path: string, enabled: boolean) => Promise<void>;
  setPrimaryPipelineFolder: (path: string) => Promise<void>;
  scanLocalScriptsNative: () => Promise<StagedScriptItem[]>;
  applyStagedNodesToPalette: (staged: StagedScriptItem[]) => Promise<void>;
  scanAndSyncScripts: () => Promise<ScriptScanSummary | null>;
  updateDraftNode: (key: string, updates: Partial<LocalDraftNode>) => Promise<void>;
  scanDraftPipelines: () => Promise<ScannedPipelineYamlItemRust[]>;
  setActiveDraftPipeline: (draft: ScannedPipelineYamlItemRust | null) => void;
}

export const useLocalWorkspaceStore = create<LocalWorkspaceState>((setStore, getStore) => ({
  projectId: null,
  config: null,
  draftNodes: {},
  scannedDraftPipelines: [],
  activeDraftPipeline: null,
  scanSummary: null,
  isScanning: false,
  isLoading: false,
  lastError: null,

  initWorkspace: async (projectId: string) => {
    if (!projectId) return;
    setStore({ projectId, isLoading: true, lastError: null });

    try {
      let loadedConfig = await get<ForgityWorkspaceConfig>(WORKSPACE_CONFIG_KEY(projectId));
      if (!loadedConfig) {
        loadedConfig = {
          projectId,
          primaryPipelineFolder: "pipelines",
          scriptFolders: [],
        };
        await set(WORKSPACE_CONFIG_KEY(projectId), loadedConfig);
      }

      const loadedDraftNodes = (await get<Record<string, LocalDraftNode>>(DRAFT_NODES_KEY(projectId))) || {};
      const loadedSummary = (await get<ScriptScanSummary>(SCAN_SUMMARY_KEY(projectId))) || null;

      setStore({
        config: loadedConfig,
        draftNodes: loadedDraftNodes,
        scanSummary: loadedSummary,
        isLoading: false,
      });
    } catch (err: any) {
      console.error("[useLocalWorkspaceStore] Failed to initialize local workspace:", err);
      setStore({
        isLoading: false,
        lastError: err?.message || "Failed to load local workspace",
      });
    }
  },

  updateConfig: async (updater) => {
    const { projectId, config } = getStore();
    if (!projectId || !config) return;

    const nextConfig = updater(config);
    setStore({ config: nextConfig });
    await set(WORKSPACE_CONFIG_KEY(projectId), nextConfig);
  },

  addScriptFolder: async (folder) => {
    await getStore().updateConfig((prev) => {
      const exists = prev.scriptFolders.some((f) => f.path.toLowerCase() === folder.path.toLowerCase());
      if (exists) return prev;
      return {
        ...prev,
        scriptFolders: [...prev.scriptFolders, folder],
      };
    });
  },

  removeScriptFolder: async (pathToRemove) => {
    await getStore().updateConfig((prev) => ({
      ...prev,
      scriptFolders: prev.scriptFolders.filter((f) => f.path.toLowerCase() !== pathToRemove.toLowerCase()),
    }));
  },

  toggleScriptFolder: async (targetPath, enabled) => {
    await getStore().updateConfig((prev) => ({
      ...prev,
      scriptFolders: prev.scriptFolders.map((f) =>
        f.path.toLowerCase() === targetPath.toLowerCase() ? { ...f, enabled } : f
      ),
    }));
  },

  setPrimaryPipelineFolder: async (primaryPath) => {
    await getStore().updateConfig((prev) => ({
      ...prev,
      primaryPipelineFolder: primaryPath,
    }));
  },

  scanLocalScriptsNative: async (): Promise<StagedScriptItem[]> => {
    const { config, draftNodes } = getStore();
    if (!config) return [];

    const activeFolders = (config.scriptFolders || []).filter((f) => f.enabled && f.path.trim().length > 0);
    if (activeFolders.length === 0) return [];

    if (!isTauriRuntime()) {
      console.warn("[useLocalWorkspaceStore] Native script analysis requires Desktop runtime.");
      return [];
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const analyzed = await invoke<any[]>("analyze_local_scripts_native", {
        folders: activeFolders.map((f) => ({
          namespace: f.namespace,
          path: f.path,
        })),
      });

      const now = new Date().toISOString();
      return analyzed.map((item) => {
        const cached = draftNodes[item.key];
        let status: ScriptSyncStatus = "unchanged";
        if (!cached) {
          status = "new";
        } else if (cached.contentHash !== item.contentHash) {
          status = "modified";
        }

        return {
          key: item.key,
          fileName: item.fileName,
          fullPath: item.fullPath,
          folderRoot: item.folderRoot,
          namespace: item.namespace,
          suggestedName: item.suggestedName,
          suggestedLabel: item.suggestedLabel,
          executor: item.executor,
          description: item.description ?? undefined,
          contentHash: item.contentHash,
          sourceCode: item.sourceCode || "",
          inputs: item.inputs || [],
          outputs: item.outputs || [],
          dependencies: item.dependencies || [],
          lastSyncedAt: now,
          status,
        };
      });
    } catch (err: any) {
      console.error("[useLocalWorkspaceStore] Native script analysis failed:", err);
      throw err;
    }
  },

  applyStagedNodesToPalette: async (staged: StagedScriptItem[]) => {
    const { projectId, draftNodes } = getStore();
    if (!projectId) return;

    const nextDraftNodes: Record<string, LocalDraftNode> = { ...draftNodes };
    let newCount = 0;
    let modified = 0;
    let unchanged = 0;

    for (const item of staged) {
      if (item.status === "new") newCount++;
      else if (item.status === "modified") modified++;
      else unchanged++;

      const { status: _s, ...nodeData } = item;
      nextDraftNodes[item.key] = nodeData;
    }

    const summary: ScriptScanSummary = {
      newCount,
      modified,
      unchanged,
      total: staged.length,
      lastScannedAt: new Date().toISOString(),
    };

    setStore({
      draftNodes: nextDraftNodes,
      scanSummary: summary,
    });

    await set(DRAFT_NODES_KEY(projectId), nextDraftNodes);
    await set(SCAN_SUMMARY_KEY(projectId), summary);
  },

  scanAndSyncScripts: async () => {
    const { isScanning } = getStore();
    if (isScanning) return null;

    setStore({ isScanning: true, lastError: null });

    try {
      const staged = await getStore().scanLocalScriptsNative();
      await getStore().applyStagedNodesToPalette(staged);
      const summary = getStore().scanSummary;
      setStore({ isScanning: false });
      return summary;
    } catch (err: any) {
      console.error("[useLocalWorkspaceStore] Error while scanning/syncing local scripts:", err);
      const errMsg = err?.message || "Failed to scan and sync local scripts";
      setStore({
        isScanning: false,
        lastError: errMsg,
      });
      throw err;
    }
  },
      });
      throw new Error(errMsg);
    }
  },

  updateDraftNode: async (key: string, updates: Partial<LocalDraftNode>) => {
    const { projectId, draftNodes } = getStore();
    if (!projectId || !draftNodes[key]) return;

    const updatedMap = {
      ...draftNodes,
      [key]: {
        ...draftNodes[key],
        ...updates,
      },
    };

    setStore({ draftNodes: updatedMap });
    await set(DRAFT_NODES_KEY(projectId), updatedMap);
  },

  scanDraftPipelines: async () => {
    const { config } = getStore();
    if (!config?.primaryPipelineFolder || !isTauriRuntime()) {
      return [];
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const drafts = await invoke<ScannedPipelineYamlItemRust[]>("scan_local_pipeline_drafts", {
        folderPath: config.primaryPipelineFolder,
      });

      setStore({ scannedDraftPipelines: drafts });
      return drafts;
    } catch (err) {
      console.warn("[useLocalWorkspaceStore] Failed to scan draft pipelines:", err);
      return [];
    }
  },

  setActiveDraftPipeline: (draft) => {
    setStore({ activeDraftPipeline: draft });
  },
}));
