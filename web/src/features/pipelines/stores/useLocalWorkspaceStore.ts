import { create } from "zustand";
import { get, set } from "idb-keyval";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import type {
  ForgityWorkspaceConfig,
  LocalDraftNode,
  ScannedScriptItemRust,
  ScriptFolderConfig,
  ScriptScanSummary,
} from "../types/workspaceConfig";
import { analyzeCustomNodesBatchStateless } from "../hooks/useAnalyzeCustomNodesStateless";

const WORKSPACE_CONFIG_KEY = (projectId: string) => `forgity:workspace_config:${projectId}`;
const DRAFT_NODES_KEY = (projectId: string) => `forgity:local_draft_nodes:${projectId}`;
const SCAN_SUMMARY_KEY = (projectId: string) => `forgity:scan_summary:${projectId}`;

interface LocalWorkspaceState {
  projectId: string | null;
  config: ForgityWorkspaceConfig | null;
  draftNodes: Record<string, LocalDraftNode>;
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
  scanAndSyncScripts: () => Promise<ScriptScanSummary | null>;
}

export const useLocalWorkspaceStore = create<LocalWorkspaceState>((setStore, getStore) => ({
  projectId: null,
  config: null,
  draftNodes: {},
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
          scriptFolders: [
            {
              namespace: "core",
              path: "pipeline-scripts",
              enabled: true,
            },
          ],
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

  scanAndSyncScripts: async () => {
    const { projectId, config, draftNodes, isScanning } = getStore();
    if (!projectId || !config || isScanning) return null;

    if (!isTauriRuntime()) {
      console.warn("[useLocalWorkspaceStore] scan_local_script_folders is only available on Desktop runtime.");
      return null;
    }

    setStore({ isScanning: true, lastError: null });

    try {
      const activeFolders = config.scriptFolders.filter((f) => f.enabled && f.path.trim().length > 0);
      if (activeFolders.length === 0) {
        setStore({ isScanning: false });
        return null;
      }

      const { invoke } = await import("@tauri-apps/api/core");
      const scannedItems = await invoke<ScannedScriptItemRust[]>("scan_local_script_folders", {
        folders: activeFolders.map((f) => ({
          namespace: f.namespace,
          path: f.path,
        })),
      });

      let unchanged = 0;
      let newCount = 0;
      let modified = 0;

      const itemsToAnalyze: ScannedScriptItemRust[] = [];
      const updatedDraftMap = { ...draftNodes };

      for (const item of scannedItems) {
        const cached = draftNodes[item.key];

        if (!cached) {
          newCount++;
          itemsToAnalyze.push(item);
        } else if (cached.contentHash === item.contentHash) {
          unchanged++;
        } else {
          modified++;
          itemsToAnalyze.push(item);
        }
      }

      // If there are new or modified scripts, send to Stateless Analyzer API
      if (itemsToAnalyze.length > 0) {
        const response = await analyzeCustomNodesBatchStateless({
          projectId,
          scripts: itemsToAnalyze.map((s) => ({
            key: s.key,
            fileName: s.fileName,
            fullPath: s.fullPath,
            scriptContent: s.content,
            contentHash: s.contentHash,
          })),
        });

        const now = new Date().toISOString();
        for (const analyzed of response.nodes) {
          const originItem = itemsToAnalyze.find((it) => it.key === analyzed.key);
          updatedDraftMap[analyzed.key] = {
            key: analyzed.key,
            fileName: analyzed.fileName,
            fullPath: analyzed.fullPath,
            folderRoot: originItem?.folderRoot || "",
            namespace: originItem?.namespace || "core",
            suggestedName: analyzed.suggestedName,
            suggestedLabel: analyzed.suggestedLabel,
            executor: analyzed.executor,
            description: analyzed.description ?? undefined,
            contentHash: analyzed.contentHash,
            inputs: analyzed.inputs as any[],
            outputs: analyzed.outputs as any[],
            dependencies: analyzed.dependencies as any[],
            lastSyncedAt: now,
          };
        }

        // Persist updated draft nodes in IndexedDB
        await set(DRAFT_NODES_KEY(projectId), updatedDraftMap);
      }

      const summary: ScriptScanSummary = {
        unchanged,
        newCount,
        modified,
        total: scannedItems.length,
        lastScannedAt: new Date().toISOString(),
      };

      await set(SCAN_SUMMARY_KEY(projectId), summary);

      setStore({
        draftNodes: updatedDraftMap,
        scanSummary: summary,
        isScanning: false,
      });

      return summary;
    } catch (err: any) {
      console.error("[useLocalWorkspaceStore] Error while scanning/syncing local scripts:", err);
      const errMsg = err?.response?.data?.message || err?.message || "Failed to scan and sync local scripts";
      setStore({
        isScanning: false,
        lastError: errMsg,
      });
      throw new Error(errMsg);
    }
  },
}));
