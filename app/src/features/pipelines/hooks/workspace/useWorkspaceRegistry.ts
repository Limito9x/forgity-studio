import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import { toast } from "sonner";

export interface RegisteredWorkspace {
  id: string;
  slug: string;
  name: string;
  rootPath: string;
  linkedProjectId?: string | null;
  originTemplateId?: string | null;
  originTemplateSlug?: string | null;
  originVersionId?: string | null;
  originTemplateTitle?: string | null;
  lastOpenedAt: string;
  createdAt: string;
}

export const WORKSPACE_REGISTRY_QUERY_KEY = ["workspace-registry"] as const;

export function useWorkspaceRegistry() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: WORKSPACE_REGISTRY_QUERY_KEY,
    queryFn: async (): Promise<RegisteredWorkspace[]> => {
      if (!isTauriRuntime()) return [];
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<RegisteredWorkspace[]>("list_registered_workspaces");
    },
    staleTime: 1000 * 60, // 1 minute
  });

  const registerMutation = useMutation({
    mutationFn: async (params: {
      name: string;
      rootPath: string;
      linkedProjectId?: string;
      originTemplateId?: string;
      originVersionId?: string;
      originTemplateTitle?: string;
    }) => {
      if (!isTauriRuntime()) {
        throw new Error("Workspace registry is only supported on Desktop (Tauri runtime).");
      }
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<RegisteredWorkspace>("register_workspace", {
        name: params.name,
        rootPath: params.rootPath,
        linkedProjectId: params.linkedProjectId ?? null,
        originTemplateId: params.originTemplateId ?? null,
        originVersionId: params.originVersionId ?? null,
        originTemplateTitle: params.originTemplateTitle ?? null,
      });
    },
    onSuccess: (newWs) => {
      queryClient.setQueryData<RegisteredWorkspace[]>(
        WORKSPACE_REGISTRY_QUERY_KEY,
        (old = []) => {
          const filtered = old.filter((w) => w.id !== newWs.id && w.rootPath !== newWs.rootPath);
          return [newWs, ...filtered];
        }
      );
      queryClient.invalidateQueries({ queryKey: WORKSPACE_REGISTRY_QUERY_KEY });
    },
  });

  const touchMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      if (!isTauriRuntime()) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("touch_workspace_opened", { workspaceId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: WORKSPACE_REGISTRY_QUERY_KEY });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      if (!isTauriRuntime()) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("remove_workspace_from_registry", { workspaceId });
    },
    onSuccess: (_, removedId) => {
      queryClient.setQueryData<RegisteredWorkspace[]>(
        WORKSPACE_REGISTRY_QUERY_KEY,
        (old = []) => old.filter((w) => w.id !== removedId)
      );
      toast.success("Workspace removed from registry.");
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to remove workspace from registry.");
    },
  });

  const revealInExplorer = async (rootPath: string) => {
    if (!isTauriRuntime()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("reveal_workspace_in_explorer", { rootPath });
    } catch (err: any) {
      toast.error(err?.message || "Failed to open folder in explorer");
    }
  };

  return {
    workspaces: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    registerWorkspace: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    touchWorkspace: touchMutation.mutateAsync,
    removeWorkspace: removeMutation.mutateAsync,
    isRemoving: removeMutation.isPending,
    revealInExplorer,
  };
}
