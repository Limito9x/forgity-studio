import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useCallback } from "react";
import { toast } from "sonner";
import type {
  WorkspaceConstantItem,
  ConstantDataType,
  ConstantScope,
} from "../../types/workspaceConfig";

export interface ResolvedConstant {
  key: string;
  rawValue: any;
  resolvedValue: any;
  dataType: ConstantDataType;
  scope: ConstantScope;
  unrealPath?: string | null;
  resolvedUnrealPath?: string | null;
  description?: string | null;
}

/**
 * Resolves recursive `$VAR_NAME` references with cycle detection and depth guard.
 */
export function resolveConstantsMap(
  constants: WorkspaceConstantItem[],
): Record<string, ResolvedConstant> {
  const rawMap = new Map<string, WorkspaceConstantItem>();
  for (const c of constants) {
    rawMap.set(c.key, c);
  }

  const resolvedMap: Record<string, ResolvedConstant> = {};

  function resolveString(str: string, visited: Set<string>, depth = 0): string {
    if (depth > 10 || !str.includes("$")) return str;

    return str.replace(/\$\{([a-zA-Z0-9_]+)\}|\$([a-zA-Z0-9_]+)/g, (match, braced, bare) => {
      const varName = braced || bare;
      if (visited.has(varName)) {
        console.warn(
          `[Constants] Cyclic dependency detected for variable: $${varName}`,
        );
        return match;
      }
      const target = rawMap.get(varName);
      if (!target) return match;

      visited.add(varName);
      const targetValStr = String(target.value ?? "");
      const res = resolveString(targetValStr, new Set(visited), depth + 1);
      return res;
    });
  }

  for (const item of constants) {
    let resolvedValue = item.value;
    if (typeof item.value === "string") {
      resolvedValue = resolveString(item.value, new Set([item.key]));
    } else if (Array.isArray(item.value)) {
      resolvedValue = item.value.map((v) =>
        typeof v === "string" ? resolveString(v, new Set([item.key])) : v,
      );
    }

    let resolvedUnrealPath = item.unrealPath;
    if (typeof item.unrealPath === "string") {
      resolvedUnrealPath = resolveString(item.unrealPath, new Set([item.key]));
    }

    resolvedMap[item.key] = {
      key: item.key,
      rawValue: item.value,
      resolvedValue,
      dataType: item.dataType,
      scope: item.scope,
      unrealPath: item.unrealPath,
      resolvedUnrealPath,
      description: item.description,
    };
  }

  return resolvedMap;
}

export function useLocalConstantsQuery(rootPath: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["local-constants", rootPath];

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
    },
    onError: (err: any) => {
      toast.error("Failed to save local constants", {
        description: err?.message,
      });
    },
  });

  const constants = query.data ?? [];

  const resolvedConstants = useMemo(() => {
    return resolveConstantsMap(constants);
  }, [constants]);

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
    resolvedConstants,
    isLoading: query.isLoading,
    upsertConstant,
    deleteConstant,
    saveConstants: (items: WorkspaceConstantItem[]) => saveMutation.mutateAsync(items),
    refetch: query.refetch,
  };
}
