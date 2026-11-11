import { create } from "zustand";
import { get, set } from "idb-keyval";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import type {
  WorkspaceRootConfig,
  WorkspaceInitResult,
  LocalDraftNode,
  ScannedPipelineYamlItemRust,
  ScriptScanSummary,
  StagedScriptItem,
  ScriptSyncStatus,
} from "../types/workspaceConfig";

const ROOT_PATH_KEY = (projectId: string) => `forgity:workspace_root:${projectId}`;

interface LocalWorkspaceState {
  projectId: string | null;
  rootPath: string | null;
  config: WorkspaceRootConfig | null;
  draftNodes: Record<string, LocalDraftNode>;
  stagedItems: StagedScriptItem[];
  scannedDraftPipelines: ScannedPipelineYamlItemRust[];
  activeDraftPipeline: ScannedPipelineYamlItemRust | null;
  scanSummary: ScriptScanSummary | null;
  isScanning: boolean;
  isLoading: boolean;
  lastError: string | null;

  // Actions
  initWorkspace: (projectId: string) => Promise<void>;
  openWorkspaceRoot: (targetRootPath: string) => Promise<void>;
  updateWorkspaceConfig: (scriptsDir: string, pipelinesDir: string) => Promise<void>;
  scanLocalScriptsNative: () => Promise<StagedScriptItem[]>;
  applyStagedNodesToPalette: (staged?: StagedScriptItem[]) => Promise<void>;
  clearLocalPalette: () => Promise<void>;
  scanAndSyncScripts: () => Promise<ScriptScanSummary | null>;
  scanDraftPipelines: () => Promise<ScannedPipelineYamlItemRust[]>;
  setActiveDraftPipeline: (draft: ScannedPipelineYamlItemRust | null) => void;

  // Pipeline File Actions (Rust Native)
  createPipelineDraft: (name: string) => Promise<ScannedPipelineYamlItemRust | null>;
  savePipelineDraft: (filePath: string, yamlContent: string) => Promise<void>;
  renamePipelineDraft: (filePath: string, newName: string) => Promise<ScannedPipelineYamlItemRust | null>;
  duplicatePipelineDraft: (filePath: string) => Promise<ScannedPipelineYamlItemRust | null>;
  deletePipelineDraft: (filePath: string) => Promise<void>;
  savePipelineSnapshotOnDisk: (pipelineSlug: string, snapshotJson: string) => Promise<void>;
  loadPipelineSnapshotFromDisk: (pipelineSlug: string) => Promise<string | null>;
}

export const useLocalWorkspaceStore = create<LocalWorkspaceState>((setStore, getStore) => ({
  projectId: null,
  rootPath: null,
  config: null,
  draftNodes: {},
  stagedItems: [],
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
      const savedRootPath = await get<string>(ROOT_PATH_KEY(projectId));
      if (savedRootPath && isTauriRuntime()) {
        await getStore().openWorkspaceRoot(savedRootPath);
      } else {
        setStore({ isLoading: false });
      }
    } catch (err: any) {
      console.error("[useLocalWorkspaceStore] Failed to initialize local workspace:", err);
      setStore({
        isLoading: false,
        lastError: err?.message || "Failed to load local workspace",
      });
    }
  },

  openWorkspaceRoot: async (targetRootPath: string) => {
    const { projectId } = getStore();
    if (!targetRootPath) return;

    setStore({ isLoading: true, lastError: null });

    try {
      if (!isTauriRuntime()) {
        setStore({
          rootPath: targetRootPath,
          config: { version: 1, scriptsDir: "pipeline-scripts", pipelinesDir: "pipelines" },
          isLoading: false,
        });
        return;
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const initResult = await invoke<WorkspaceInitResult>("open_or_init_workspace_root", {
        rootPath: targetRootPath,
      });

      let loadedPalette: Record<string, LocalDraftNode> = {};
      if (initResult.localPaletteJson) {
        try {
          loadedPalette = JSON.parse(initResult.localPaletteJson);
        } catch (e) {
          console.warn("[useLocalWorkspaceStore] Failed to parse local_palette.json:", e);
        }
      }

      if (projectId) {
        await set(ROOT_PATH_KEY(projectId), targetRootPath);
      }

      setStore({
        rootPath: initResult.rootPath,
        config: initResult.config,
        draftNodes: loadedPalette,
        isLoading: false,
      });

      // Automatically scan draft pipelines
      await getStore().scanDraftPipelines();
    } catch (err: any) {
      console.error("[useLocalWorkspaceStore] Failed to open workspace root:", err);
      setStore({
        isLoading: false,
        lastError: err?.message || "Failed to open workspace root",
      });
      throw err;
    }
  },

  updateWorkspaceConfig: async (scriptsDir: string, pipelinesDir: string) => {
    const { rootPath, config } = getStore();
    if (!rootPath || !config) return;

    try {
      if (isTauriRuntime()) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("save_workspace_root_config", {
          rootPath,
          scriptsDir,
          pipelinesDir,
        });
      }

      setStore({
        config: {
          ...config,
          scriptsDir,
          pipelinesDir,
        },
      });

      await getStore().scanDraftPipelines();
    } catch (err: any) {
      console.error("[useLocalWorkspaceStore] Failed to save config:", err);
      throw err;
    }
  },

  scanLocalScriptsNative: async (): Promise<StagedScriptItem[]> => {
    const { rootPath, config, draftNodes } = getStore();
    if (!rootPath || !config) return [];

    if (!isTauriRuntime()) {
      console.warn("[useLocalWorkspaceStore] Native script analysis requires Desktop runtime.");
      return [];
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const scriptsFullPath = config.scriptsDir === "." 
        ? rootPath 
        : `${rootPath.replace(/[/\\]+$/, "")}/${config.scriptsDir.replace(/^[/\\]+/, "")}`;

      const analyzed = await invoke<any[]>("analyze_local_scripts_native", {
        folders: [{
          namespace: "",
          path: scriptsFullPath,
        }],
      });

      const now = new Date().toISOString();
      const staged: StagedScriptItem[] = analyzed.map((item) => {
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
          namespace: "",
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

      setStore({ stagedItems: staged });
      return staged;
    } catch (err: any) {
      console.error("[useLocalWorkspaceStore] Native script analysis failed:", err);
      throw err;
    }
  },

  applyStagedNodesToPalette: async (stagedParam?: StagedScriptItem[]) => {
    const { rootPath, draftNodes, stagedItems } = getStore();
    if (!rootPath) return;

    const itemsToApply = stagedParam || stagedItems;
    const nextDraftNodes: Record<string, LocalDraftNode> = { ...draftNodes };
    let newCount = 0;
    let modified = 0;
    let unchanged = 0;

    for (const item of itemsToApply) {
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
      total: itemsToApply.length,
      lastScannedAt: new Date().toISOString(),
    };

    setStore({
      draftNodes: nextDraftNodes,
      scanSummary: summary,
    });

    if (isTauriRuntime()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_local_palette", {
        rootPath,
        paletteJson: JSON.stringify(nextDraftNodes, null, 2),
      });
    }
  },

  clearLocalPalette: async () => {
    const { rootPath } = getStore();
    if (!rootPath) return;

    setStore({
      draftNodes: {},
      stagedItems: [],
      scanSummary: null,
    });

    if (isTauriRuntime()) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_local_palette", {
        rootPath,
        paletteJson: "{}",
      });
    }
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

  scanDraftPipelines: async () => {
    const { rootPath, config } = getStore();
    if (!rootPath || !config?.pipelinesDir || !isTauriRuntime()) {
      return [];
    }

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const pipelinesFullPath = config.pipelinesDir === "."
        ? rootPath
        : `${rootPath.replace(/[/\\]+$/, "")}/${config.pipelinesDir.replace(/^[/\\]+/, "")}`;

      const drafts = await invoke<ScannedPipelineYamlItemRust[]>("scan_local_pipeline_drafts", {
        folderPath: pipelinesFullPath,
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

  createPipelineDraft: async (name: string) => {
    const { rootPath, config } = getStore();
    if (!rootPath || !config || !isTauriRuntime()) return null;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const pipelinesFullPath = `${rootPath.replace(/[/\\]+$/, "")}/${config.pipelinesDir.replace(/^[/\\]+/, "")}`;
      const created = await invoke<ScannedPipelineYamlItemRust>("create_local_pipeline_draft", {
        pipelinesDirPath: pipelinesFullPath,
        name,
      });

      await getStore().scanDraftPipelines();
      setStore({ activeDraftPipeline: created });
      return created;
    } catch (err) {
      console.error("[useLocalWorkspaceStore] Failed to create pipeline draft:", err);
      throw err;
    }
  },

  savePipelineDraft: async (filePath: string, yamlContent: string) => {
    if (!isTauriRuntime()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_local_pipeline_draft", {
        filePath,
        content: yamlContent,
      });
      // update active draft content in store
      const active = getStore().activeDraftPipeline;
      if (active && active.fullPath === filePath) {
        setStore({
          activeDraftPipeline: {
            ...active,
            content: yamlContent,
            lastModifiedMs: Date.now(),
          },
        });
      }
    } catch (err) {
      console.error("[useLocalWorkspaceStore] Failed to save pipeline draft:", err);
      throw err;
    }
  },

  renamePipelineDraft: async (filePath: string, newName: string) => {
    if (!isTauriRuntime()) return null;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const updated = await invoke<ScannedPipelineYamlItemRust>("rename_local_pipeline_draft", {
        filePath,
        newName,
      });
      await getStore().scanDraftPipelines();
      setStore({ activeDraftPipeline: updated });
      return updated;
    } catch (err) {
      console.error("[useLocalWorkspaceStore] Failed to rename pipeline draft:", err);
      throw err;
    }
  },

  duplicatePipelineDraft: async (filePath: string) => {
    if (!isTauriRuntime()) return null;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const duplicated = await invoke<ScannedPipelineYamlItemRust>("duplicate_local_pipeline_draft", {
        filePath,
      });
      await getStore().scanDraftPipelines();
      setStore({ activeDraftPipeline: duplicated });
      return duplicated;
    } catch (err) {
      console.error("[useLocalWorkspaceStore] Failed to duplicate pipeline draft:", err);
      throw err;
    }
  },

  deletePipelineDraft: async (filePath: string) => {
    if (!isTauriRuntime()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_local_pipeline_draft", {
        filePath,
      });
      const active = getStore().activeDraftPipeline;
      if (active && active.fullPath === filePath) {
        setStore({ activeDraftPipeline: null });
      }
      await getStore().scanDraftPipelines();
    } catch (err) {
      console.error("[useLocalWorkspaceStore] Failed to delete pipeline draft:", err);
      throw err;
    }
  },

  savePipelineSnapshotOnDisk: async (pipelineSlug: string, snapshotJson: string) => {
    const { rootPath } = getStore();
    if (!rootPath || !isTauriRuntime()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_local_pipeline_snapshot", {
        rootPath,
        pipelineSlug,
        snapshotJson,
      });
    } catch (err) {
      console.error("[useLocalWorkspaceStore] Failed to save pipeline snapshot on disk:", err);
    }
  },

  loadPipelineSnapshotFromDisk: async (pipelineSlug: string) => {
    const { rootPath } = getStore();
    if (!rootPath || !isTauriRuntime()) return null;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const snap = await invoke<string | null>("load_local_pipeline_snapshot", {
        rootPath,
        pipelineSlug,
      });
      return snap;
    } catch (err) {
      console.warn("[useLocalWorkspaceStore] Failed to load pipeline snapshot from disk:", err);
      return null;
    }
  },
}));
