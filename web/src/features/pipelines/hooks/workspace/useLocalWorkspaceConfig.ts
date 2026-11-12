import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, set } from "idb-keyval";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import type { WorkspaceInitResult } from "../../types/workspaceConfig";

export const ROOT_PATH_KEY = (projectId: string) => `forgity:workspace_root:${projectId}`;

export const WORKSPACE_CONFIG_QUERY_KEY = (projectId: string) => ["local-workspace", "config", projectId] as const;

/**
 * Hook hạ tầng quản lý Root Path & Config (.forgity/config.json) của Local Workspace
 */
export function useLocalWorkspaceConfig(projectId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: WORKSPACE_CONFIG_QUERY_KEY(projectId),
    queryFn: async (): Promise<WorkspaceInitResult | null> => {
      if (!isTauriRuntime() || !projectId) return null;

      const savedRootPath = await get<string>(ROOT_PATH_KEY(projectId));
      if (!savedRootPath) return null;

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const initResult = await invoke<WorkspaceInitResult>(
          "open_or_init_workspace_root",
          {
            rootPath: savedRootPath,
          },
        );

        if (initResult.rootPath) {
          await set(ROOT_PATH_KEY(projectId), initResult.rootPath);
        }

        return initResult;
      } catch (err) {
        console.warn(
          "[useLocalWorkspaceConfig] Saved root path is invalid or moved:",
          err,
        );
        return null;
      }
    },
    staleTime: Infinity, // Cấu hình root chỉ thay đổi khi user chủ động switch folder hoặc lưu setting
  });

  const switchRootMutation = useMutation({
    mutationFn: async (targetRootPath: string) => {
      if (!isTauriRuntime() || !projectId) return null;
      const { invoke } = await import("@tauri-apps/api/core");

      const initResult = await invoke<WorkspaceInitResult>(
        "open_or_init_workspace_root",
        {
          rootPath: targetRootPath,
        },
      );

      if (initResult.rootPath) {
        await set(ROOT_PATH_KEY(projectId), initResult.rootPath);
      }

      return initResult;
    },
    onSuccess: (newInitResult) => {
      queryClient.setQueryData(WORKSPACE_CONFIG_QUERY_KEY(projectId), newInitResult);
      // Khi đổi root folder, toàn bộ pipeline và palette query của workspace cũ đều bị invalidate
      queryClient.invalidateQueries({ queryKey: ["local-workspace"] });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ scriptsDir, pipelinesDir }: { scriptsDir: string; pipelinesDir: string }) => {
      const rootPath = query.data?.rootPath;
      if (!rootPath || !isTauriRuntime()) return;

      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_workspace_root_config", {
        rootPath,
        scriptsDir,
        pipelinesDir,
      });

      return { scriptsDir, pipelinesDir };
    },
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData(WORKSPACE_CONFIG_QUERY_KEY(projectId), (old: WorkspaceInitResult | null) => {
        if (!old) return old;
        return {
          ...old,
          config: {
            ...old.config,
            scriptsDir: updated.scriptsDir,
            pipelinesDir: updated.pipelinesDir,
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["local-workspace", "pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["local-workspace", "palette"] });
    },
  });

  return {
    rootPath: query.data?.rootPath || null,
    config: query.data?.config || null,
    initialPaletteJson: query.data?.localPaletteJson || null,
    initialStructsJson: query.data?.localStructsJson || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    switchRootFolder: switchRootMutation.mutateAsync,
    isSwitchingRoot: switchRootMutation.isPending,
    updateConfig: updateConfigMutation.mutateAsync,
    isUpdatingConfig: updateConfigMutation.isPending,
  };
}
