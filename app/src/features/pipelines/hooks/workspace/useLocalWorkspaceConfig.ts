import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, set } from "idb-keyval";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import type { WorkspaceInitResult } from "../../types/workspaceConfig";

export const ROOT_PATH_KEY = (projectId: string) => `forgity:workspace_root:${projectId}`;

export const WORKSPACE_CONFIG_QUERY_KEY = (
  projectId: string,
  explicitRootPath?: string | null,
) => ["local-workspace", "config", projectId, explicitRootPath ?? null] as const;

/**
 * Hook hạ tầng quản lý Root Path & Config (.forgity/config.json) của Local Workspace
 * Hỗ trợ cả targetId là projectId (legacy) hoặc workspaceId/rootPath trực tiếp.
 */
export function useLocalWorkspaceConfig(targetId: string, initialExplicitRootPath?: string | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: WORKSPACE_CONFIG_QUERY_KEY(targetId, initialExplicitRootPath),
    queryFn: async (): Promise<WorkspaceInitResult | null> => {
      if (!isTauriRuntime() || !targetId) return null;

      // 1. Nếu có explicit root path (ví dụ mở từ Workspace Registry)
      let resolvedRootPath = initialExplicitRootPath;

      // 2. Tra cứu từ Workspace Registry DB theo workspaceId
      const { invoke } = await import("@tauri-apps/api/core");
      if (!resolvedRootPath) {
        try {
          const registered = await invoke<any>("get_registered_workspace", {
            workspaceId: targetId,
          });
          if (registered?.rootPath) {
            resolvedRootPath = registered.rootPath;
          }
        } catch {
          // ignore error if not in registry
        }
      }

      // 3. Fallback sang IndexedDB (legacy theo projectId)
      if (!resolvedRootPath) {
        resolvedRootPath = await get<string>(ROOT_PATH_KEY(targetId));
      }

      if (!resolvedRootPath) return null;

      try {
        const initResult = await invoke<WorkspaceInitResult>(
          "open_or_init_workspace_root",
          {
            rootPath: resolvedRootPath,
          },
        );

        if (initResult.rootPath) {
          await set(ROOT_PATH_KEY(targetId), initResult.rootPath);
          // Tự động bảo đảm workspace được ghi nhận vào Workspace Registry
          try {
            const folderName = initResult.rootPath.split(/[/\\]/).filter(Boolean).pop() || "Workspace";
            await invoke("register_workspace", {
              name: folderName,
              rootPath: initResult.rootPath,
              linkedProjectId: targetId.startsWith("ws_") ? null : targetId,
              originTemplateId: initResult.originTemplateId ?? null,
              originTemplateSlug: initResult.originTemplateSlug ?? null,
              originVersionId: initResult.originVersionId ?? null,
              originTemplateTitle: initResult.originTemplateTitle ?? null,
            });
          } catch {
            // non-blocking
          }
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
      if (!isTauriRuntime() || !targetId) return null;
      const { invoke } = await import("@tauri-apps/api/core");

      const initResult = await invoke<WorkspaceInitResult>(
        "open_or_init_workspace_root",
        {
          rootPath: targetRootPath,
        },
      );

      if (initResult.rootPath) {
        await set(ROOT_PATH_KEY(targetId), initResult.rootPath);
        try {
          const folderName = initResult.rootPath.split(/[/\\]/).filter(Boolean).pop() || "Workspace";
          await invoke("register_workspace", {
            name: folderName,
            rootPath: initResult.rootPath,
            linkedProjectId: targetId.startsWith("ws_") ? null : targetId,
            originTemplateId: initResult.originTemplateId ?? null,
            originTemplateSlug: initResult.originTemplateSlug ?? null,
            originVersionId: initResult.originVersionId ?? null,
            originTemplateTitle: initResult.originTemplateTitle ?? null,
          });
        } catch {
          // non-blocking
        }
      }

      return initResult;
    },
    onSuccess: (newInitResult) => {
      queryClient.setQueryData(
        WORKSPACE_CONFIG_QUERY_KEY(targetId, initialExplicitRootPath),
        newInitResult,
      );
      // Khi đổi root folder, toàn bộ pipeline và palette query của workspace cũ đều bị invalidate
      queryClient.invalidateQueries({ queryKey: ["local-workspace"] });
      queryClient.invalidateQueries({ queryKey: ["workspace-registry"] });
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({
      scriptsDir,
      pipelinesDir,
      ignorePatterns,
    }: {
      scriptsDir: string;
      pipelinesDir: string;
      ignorePatterns?: string[];
    }) => {
      const rootPath = query.data?.rootPath;
      if (!rootPath || !isTauriRuntime()) return;

      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_workspace_root_config", {
        rootPath,
        scriptsDir,
        pipelinesDir,
        ignorePatterns: ignorePatterns || [],
      });

      return { scriptsDir, pipelinesDir, ignorePatterns: ignorePatterns || [] };
    },
    onSuccess: (updated) => {
      if (!updated) return;
      queryClient.setQueryData(
        WORKSPACE_CONFIG_QUERY_KEY(targetId, initialExplicitRootPath),
        (old: WorkspaceInitResult | null) => {
        if (!old) return old;
        return {
          ...old,
          config: {
            ...old.config,
            scriptsDir: updated.scriptsDir,
            pipelinesDir: updated.pipelinesDir,
            ignorePatterns: updated.ignorePatterns,
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
    originTemplateId: query.data?.originTemplateId || null,
    originTemplateSlug: query.data?.originTemplateSlug || null,
    originVersionId: query.data?.originVersionId || null,
    originTemplateVersion: query.data?.originTemplateVersion ?? null,
    originTemplateTitle: query.data?.originTemplateTitle || null,
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
