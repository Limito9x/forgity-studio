import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import { formatNodeLabel } from "../../utils/labelFormatter";
import type {
  LocalDraftNode,
  LocalStructDefinition,
  ScriptScanSummary,
} from "../../types/workspaceConfig";

export const LOCAL_PALETTE_QUERY_KEY = (rootPath: string | null) =>
  ["local-workspace", "palette", rootPath] as const;

export interface LocalPaletteData {
  draftNodes: Record<string, LocalDraftNode>;
  localStructs: LocalStructDefinition[];
  scanSummary: ScriptScanSummary | null;
}

/**
 * Hook hạ tầng quản lý Palette Nodes và Local Structs (Single Source of Truth trên đĩa)
 */
export function useLocalPaletteQuery(rootPath: string | null, scriptsDir?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: LOCAL_PALETTE_QUERY_KEY(rootPath),
    queryFn: async (): Promise<LocalPaletteData> => {
      if (!isTauriRuntime() || !rootPath) {
        return { draftNodes: {}, localStructs: [], scanSummary: null };
      }

      const { invoke } = await import("@tauri-apps/api/core");

      let draftNodes: Record<string, LocalDraftNode> = {};
      try {
        const paletteStr = await invoke<string>("load_local_palette", {
          rootPath,
        });
        if (paletteStr) {
          draftNodes = JSON.parse(paletteStr);
        }
      } catch (e) {
        console.warn(
          "[useLocalPaletteQuery] Failed to load local_palette.json:",
          e,
        );
      }

      let localStructs: LocalStructDefinition[] = [];
      try {
        const structsStr = await invoke<string>("load_local_structs", {
          rootPath,
        });
        if (structsStr) {
          localStructs = JSON.parse(structsStr);
        }
      } catch (e) {
        console.warn(
          "[useLocalPaletteQuery] Failed to load local_structs.json:",
          e,
        );
      }

      return {
        draftNodes,
        localStructs,
        scanSummary: null,
      };
    },
    enabled: Boolean(rootPath),
    staleTime: 1000 * 60 * 10, // Giữ 10 phút, chỉ làm mới khi bấm Sync hoặc đổi folder
  });

  // 1. Mutation Preview Scan: Chỉ phân tích AST in-memory để phục vụ Review Sheet.
  // TUYỆT ĐỐI KHÔNG ghi xuống đĩa, KHÔNG cập nhật cache Outliner cho đến khi user bấm Apply.
  const previewScanMutation = useMutation({
    mutationFn: async (): Promise<LocalPaletteData | null> => {
      if (!isTauriRuntime() || !rootPath) return null;

      const { invoke } = await import("@tauri-apps/api/core");
      const currentDir = scriptsDir || "scripts";
      const scriptsFullPath =
        currentDir === "."
          ? rootPath
          : `${rootPath.replace(/[/\\]+$/, "")}/${currentDir.replace(/^[/\\]+/, "")}`;

      // 1. Phân tích qua Rust Native Analyzer
      const analyzed = await invoke<any[]>("analyze_local_scripts_native", {
        folders: [
          {
            namespace: "",
            path: scriptsFullPath,
          },
        ],
      });

      const currentPalette = query.data?.draftNodes || {};
      const currentStructs = [...(query.data?.localStructs || [])];
      const now = new Date().toISOString();

      let newCount = 0;
      let modified = 0;
      let unchanged = 0;
      const nextDraftNodes: Record<string, LocalDraftNode> = { ...currentPalette };

      for (const item of analyzed) {
        const cached = currentPalette[item.key];
        if (!cached) {
          newCount++;
        } else if (cached.contentHash !== item.contentHash) {
          modified++;
        } else {
          unchanged++;
        }

        nextDraftNodes[item.key] = {
          key: item.key,
          fileName: item.fileName,
          fullPath: item.fullPath,
          folderRoot: item.folderRoot,
          namespace: "",
          suggestedName: item.suggestedName,
          suggestedLabel: formatNodeLabel(item.suggestedLabel || item.fileName),
          executor: item.executor,
          description: item.description ?? undefined,
          contentHash: item.contentHash,
          sourceCode: item.sourceCode || "",
          inputs: item.inputs || [],
          outputs: item.outputs || [],
          detectedStructs: item.detectedStructs || [],
          dependencies: item.dependencies || [],
          lastSyncedAt: now,
        };
      }

      // 2. Tự động thu hoạch struct từ detectedStructs của Python
      for (const item of analyzed) {
        if (Array.isArray(item.detectedStructs) && item.detectedStructs.length > 0) {
          for (const ds of item.detectedStructs) {
            const existingIdx = currentStructs.findIndex((s) => s.slug === ds.slug);
            if (existingIdx >= 0) {
              currentStructs[existingIdx] = {
                ...currentStructs[existingIdx],
                displayName: ds.displayName,
                fields: ds.fields,
                updatedAt: now,
              };
            } else {
              currentStructs.push({
                slug: ds.slug,
                displayName: ds.displayName,
                description: ds.description || "",
                fields: ds.fields,
                updatedAt: now,
              });
            }
          }
        }
      }

      const summary: ScriptScanSummary = {
        newCount,
        modified,
        unchanged,
        total: analyzed.length,
        lastScannedAt: now,
      };

      return {
        draftNodes: nextDraftNodes,
        localStructs: currentStructs,
        scanSummary: summary,
      };
    },
  });

  // 2. Mutation Apply Palette: Lưu toàn bộ nodes & structs được người dùng duyệt vào file và cập nhật Palette cache
  const applyPaletteMutation = useMutation({
    mutationFn: async ({
      nodes,
      structs,
      scanSummary,
    }: {
      nodes: Record<string, LocalDraftNode>;
      structs?: LocalStructDefinition[];
      scanSummary?: ScriptScanSummary | null;
    }) => {
      if (!isTauriRuntime() || !rootPath) return null;
      const { invoke } = await import("@tauri-apps/api/core");

      await invoke("save_local_palette", {
        rootPath,
        paletteJson: JSON.stringify(nodes, null, 2),
      });

      const nextStructs = structs ?? (query.data?.localStructs || []);
      if (structs && structs.length > 0) {
        await invoke("save_local_structs", {
          rootPath,
          structsJson: JSON.stringify(nextStructs, null, 2),
        });
      }

      return {
        draftNodes: nodes,
        localStructs: nextStructs,
        scanSummary: scanSummary ?? query.data?.scanSummary ?? null,
      };
    },
    onSuccess: (appliedData) => {
      if (!appliedData) return;
      queryClient.setQueryData(LOCAL_PALETTE_QUERY_KEY(rootPath), appliedData);
    },
  });

  // 3. Quick Scan & Sync: Quét và Apply trực tiếp (cho nút Sync nhanh ở Outliner)
  const scanAndSyncMutation = useMutation({
    mutationFn: async () => {
      const scanned = await previewScanMutation.mutateAsync();
      if (!scanned) return null;
      return await applyPaletteMutation.mutateAsync({
        nodes: scanned.draftNodes,
        structs: scanned.localStructs,
        scanSummary: scanned.scanSummary,
      });
    },
  });

  // Mutation xóa sạch local palette trên đĩa
  const clearPaletteMutation = useMutation({
    mutationFn: async () => {
      if (!isTauriRuntime() || !rootPath) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_local_palette", {
        rootPath,
        paletteJson: "{}",
      });
    },
    onSuccess: () => {
      queryClient.setQueryData(LOCAL_PALETTE_QUERY_KEY(rootPath), (old: LocalPaletteData | null) => ({
        draftNodes: {},
        localStructs: old?.localStructs || [],
        scanSummary: null,
      }));
    },
  });

  // Mutation xóa 1 local struct
  const deleteStructMutation = useMutation({
    mutationFn: async (slug: string) => {
      if (!isTauriRuntime() || !rootPath) return;
      const { invoke } = await import("@tauri-apps/api/core");
      const current = query.data?.localStructs || [];
      const nextStructs = current.filter((s) => s.slug !== slug);
      await invoke("save_local_structs", {
        rootPath,
        structsJson: JSON.stringify(nextStructs, null, 2),
      });
      return nextStructs;
    },
    onSuccess: (nextStructs) => {
      if (!nextStructs) return;
      queryClient.setQueryData(LOCAL_PALETTE_QUERY_KEY(rootPath), (old: LocalPaletteData | null) => ({
        draftNodes: old?.draftNodes || {},
        localStructs: nextStructs,
        scanSummary: old?.scanSummary || null,
      }));
    },
  });

  return {
    draftNodes: query.data?.draftNodes || {},
    localStructs: query.data?.localStructs || [],
    scanSummary: query.data?.scanSummary || null,
    isLoading: query.isLoading,
    isScanning: previewScanMutation.isPending || scanAndSyncMutation.isPending,
    previewScanScripts: previewScanMutation.mutateAsync,
    scanAndSyncScripts: scanAndSyncMutation.mutateAsync,
    applyPalette: applyPaletteMutation.mutateAsync,
    clearPalette: clearPaletteMutation.mutateAsync,
    savePalette: (nodes: Record<string, LocalDraftNode>) =>
      applyPaletteMutation.mutateAsync({ nodes }),
    deleteLocalStruct: deleteStructMutation.mutateAsync,
  };
}
