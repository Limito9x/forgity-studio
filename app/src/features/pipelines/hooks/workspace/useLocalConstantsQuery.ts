import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { toast } from "sonner";
import type { WorkspaceConstantItem } from "../../types/workspaceConfig";
import type { NodePaletteItemDto } from "@/gen/model";

export function useLocalConstantsQuery(rootPath: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["local-constants", rootPath];
  const paletteQueryKey = ["local-constant-palette", rootPath];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<WorkspaceConstantItem[]> => {
      if (!rootPath) return [];
      try {
        const jsonStr = await invoke<string>("load_local_constants", {
          rootPath,
        });
        if (!jsonStr || jsonStr.trim() === "[]" || jsonStr.trim() === "{}") {
          return [];
        }
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.warn("[useLocalConstantsQuery] Failed to load constants:", err);
        return [];
      }
    },
    enabled: Boolean(rootPath),
    staleTime: 1000 * 60 * 5,
  });

  const saveMutation = useMutation({
    mutationFn: async (items: WorkspaceConstantItem[]) => {
      if (!rootPath) return;
      const jsonStr = JSON.stringify(items, null, 2);
      await invoke("save_local_constants", {
        rootPath,
        constantsJson: jsonStr,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: paletteQueryKey });
      queryClient.invalidateQueries({ queryKey: ["local-node-contracts", rootPath] });
    },
    onError: (err: any) => {
      toast.error("Failed to save local constants", {
        description: err?.message,
      });
    },
  });

  const constants = query.data ?? [];

  const upsertConstant = useCallback(
    async (item: WorkspaceConstantItem) => {
      const existing = [...constants];
      const idx = existing.findIndex((c) => c.key === item.key);
      const updatedItem = {
        ...item,
        updatedAt: new Date().toISOString(),
      };
      if (idx !== -1) {
        existing[idx] = updatedItem;
      } else {
        existing.push(updatedItem);
      }
      await saveMutation.mutateAsync(existing);
      toast.success(`Constant '${item.key}' saved.`);
    },
    [constants, saveMutation],
  );

  const deleteConstant = useCallback(
    async (key: string) => {
      const next = constants.filter((c) => c.key !== key);
      await saveMutation.mutateAsync(next);
      toast.success(`Constant '${key}' removed.`);
    },
    [constants, saveMutation],
  );

  return {
    constants,
    isLoading: query.isLoading,
    upsertConstant,
    deleteConstant,
    saveConstants: (items: WorkspaceConstantItem[]) => saveMutation.mutateAsync(items),
    refetch: query.refetch,
  };
}

export function useLocalConstantPaletteQuery(rootPath: string | null) {
  return useQuery({
    queryKey: ["local-constant-palette", rootPath],
    queryFn: async (): Promise<NodePaletteItemDto[]> => {
      if (!rootPath) return [];
      try {
        const items = await invoke<NodePaletteItemDto[]>("load_constant_palette", {
          rootPath,
        });
        return Array.isArray(items) ? items : [];
      } catch (err) {
        console.warn("[useLocalConstantPaletteQuery] Failed to load constant palette:", err);
        return [];
      }
    },
    enabled: Boolean(rootPath),
    staleTime: 1000 * 60 * 5,
  });
}

export function useLocalNodeContractsQuery(rootPath: string | null) {
  return useQuery({
    queryKey: ["local-node-contracts", rootPath],
    queryFn: async (): Promise<NodePaletteItemDto[]> => {
      if (!rootPath) return [];
      try {
        const items = await invoke<NodePaletteItemDto[]>("load_workspace_node_contracts", {
          rootPath,
        });
        return Array.isArray(items) ? items : [];
      } catch (err) {
        console.warn("[useLocalNodeContractsQuery] Failed to load node contracts:", err);
        return [];
      }
    },
    enabled: Boolean(rootPath),
    staleTime: 1000 * 60 * 5,
  });
}
