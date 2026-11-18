import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { toast } from "sonner";
import type { WorkspaceConstantItem } from "../../types/workspaceConfig";
import type { LocalDraftNode } from "../../types/workspaceConfig";
import {
  PipelineNodeKind,
  type NodePaletteItemDto,
} from "@/features/pipelines/types/pipelineGraphTypes";

type LocalDraftPaletteContract = Pick<
  LocalDraftNode,
  "key" | "fileName" | "executor" | "inputs" | "outputs"
> &
  Partial<
    Pick<
      LocalDraftNode,
      "fullPath" | "suggestedName" | "suggestedLabel" | "description"
    >
  >;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalDraftNode(value: unknown): value is LocalDraftPaletteContract {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    typeof value.fileName === "string" &&
    typeof value.executor === "string" &&
    Array.isArray(value.inputs) &&
    Array.isArray(value.outputs)
  );
}

function normalizeWorkspaceNodeContract(
  value: unknown,
  index: number
): NodePaletteItemDto {
  if (!isRecord(value)) {
    throw new Error(`Local Workspace node contract ${index} is invalid.`);
  }

  const refId =
    (typeof value.refId === "string" && value.refId) ||
    (typeof value.key === "string" && value.key) ||
    (typeof value.id === "string" && value.id);
  if (!refId) {
    throw new Error(`Local Workspace node contract ${index} has no reference ID.`);
  }

  const source = typeof value.source === "string" ? value.source : "";
  const contractKind = Object.values(PipelineNodeKind).find(
    (kind) => kind === value.kind
  );
  const kind =
    contractKind ??
    (source === "BuiltIn"
      ? PipelineNodeKind.FlowControl
      : source === "SubPipeline"
        ? PipelineNodeKind.SubPipeline
        : source === "Custom" || source === "LocalDraft"
          ? PipelineNodeKind.Custom
          : source === "Tool"
            ? PipelineNodeKind.Tool
            : undefined);
  if (!kind) {
    throw new Error(`Local Workspace node contract "${refId}" has an invalid kind.`);
  }

  return {
    ...value,
    refId,
    name:
      (typeof value.name === "string" && value.name) ||
      (typeof value.label === "string" && value.label) ||
      refId,
    kind,
  } as NodePaletteItemDto;
}

export async function loadLocalNodeContracts(
  rootPath: string
): Promise<NodePaletteItemDto[]> {
  if (!rootPath) {
    throw new Error("A Local Workspace root is required to load node contracts.");
  }

  const paletteJson = await invoke<string>("load_local_palette", { rootPath });
  let parsedPalette: unknown;
  try {
    parsedPalette = JSON.parse(paletteJson);
  } catch {
    throw new Error("Local Workspace returned invalid palette JSON.");
  }
  if (!isRecord(parsedPalette)) {
    throw new Error("Local Workspace returned an invalid palette contract.");
  }
  const workspaceItems = await invoke<unknown[]>(
    "load_workspace_node_contracts",
    { rootPath }
  );
  if (!Array.isArray(workspaceItems)) {
    throw new Error("Local Workspace returned an invalid node contract collection.");
  }

  const draftItems = Object.values(parsedPalette).map((value, index) => {
    if (!isLocalDraftNode(value)) {
      throw new Error(`Local Workspace palette item ${index} is invalid.`);
    }

    const isPure = (value.executor || "").toLowerCase() === "pure";
    return {
      refId: `local:${value.key}`,
      name: value.suggestedLabel || value.suggestedName || value.fileName,
      kind: PipelineNodeKind.Custom,
      key: `local:${value.key}`,
      label: value.suggestedLabel || value.suggestedName || value.fileName,
      category: "Local Scripts",
      source: "LocalDraft",
      executor: value.executor,
      execInputs: isPure ? [] : [{ id: "exec_in", label: "Exec" }],
      execOutputs: isPure ? [] : [{ id: "exec_out", label: "Exec" }],
      inputs: value.inputs,
      outputs: value.outputs,
      description: value.description || value.fullPath,
      id: `local:${value.key}`,
      isVisibleInPalette: true,
    };
  });

  const items = [
    ...draftItems,
    ...workspaceItems.map(normalizeWorkspaceNodeContract),
  ];
  return [...new Map(items.map((item) => [item.refId, item])).values()];
}

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
        return await loadLocalNodeContracts(rootPath);
      } catch (err) {
        console.warn("[useLocalNodeContractsQuery] Failed to load node contracts:", err);
        return [];
      }
    },
    enabled: Boolean(rootPath),
    staleTime: 1000 * 60 * 5,
  });
}
