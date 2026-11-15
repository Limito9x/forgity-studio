import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import type { ScannedPipelineYamlItemRust } from "../../types/workspaceConfig";

export const LOCAL_PIPELINES_QUERY_KEY = (rootPath: string | null) =>
  ["local-workspace", "pipelines", rootPath] as const;

export async function saveLocalPipelineDraft(
  filePath: string,
  content: string,
): Promise<void> {
  if (!isTauriRuntime()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_local_pipeline_draft", { filePath, content });
}

export async function loadLocalPipelineSnapshot(
  rootPath: string,
  slug: string,
): Promise<string | null> {
  if (!isTauriRuntime() || !rootPath || !slug) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<string | null>("load_local_pipeline_snapshot", {
    rootPath,
    pipelineSlug: slug,
  });
}

export async function saveLocalPipelineSnapshot(
  rootPath: string,
  slug: string,
  snapshotJson: string,
): Promise<void> {
  if (!isTauriRuntime() || !rootPath || !slug) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_local_pipeline_snapshot", {
    rootPath,
    pipelineSlug: slug,
    snapshotJson,
  });
}

/**
 * Hook hạ tầng quản lý danh sách Pipelines & Components (.yaml) trên đĩa
 */
export function useLocalPipelinesQuery(
  rootPath: string | null,
  pipelinesDir?: string,
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: LOCAL_PIPELINES_QUERY_KEY(rootPath),
    queryFn: async (): Promise<ScannedPipelineYamlItemRust[]> => {
      if (!isTauriRuntime() || !rootPath) return [];

      const { invoke } = await import("@tauri-apps/api/core");
      const currentDir = pipelinesDir || "pipelines";
      const pipelinesFullPath =
        currentDir === "."
          ? rootPath
          : `${rootPath.replace(/[/\\]+$/, "")}/${currentDir.replace(/^[/\\]+/, "")}`;

      const drafts = await invoke<ScannedPipelineYamlItemRust[]>(
        "scan_local_pipeline_drafts",
        {
          folderPath: pipelinesFullPath,
        },
      );

      return drafts;
    },
    enabled: Boolean(rootPath),
    staleTime: 1000 * 30, // 30s cache
  });

  const pipelines = query.data || [];
  const componentPipes = pipelines.filter(
    (p) => p.pipelineKind === "component",
  );
  const masterPipelines = pipelines.filter(
    (p) => p.pipelineKind !== "component",
  );

  // Mutation Tạo mới Pipeline/Component
  const createPipelineMutation = useMutation({
    mutationFn: async ({
      name,
      kind = "master",
      executor,
    }: {
      name: string;
      kind?: "component" | "master";
      executor?: string;
    }) => {
      if (!isTauriRuntime() || !rootPath) return null;

      const { invoke } = await import("@tauri-apps/api/core");
      const currentDir = pipelinesDir || "pipelines";
      const pipelinesFullPath =
        currentDir === "."
          ? rootPath
          : `${rootPath.replace(/[/\\]+$/, "")}/${currentDir.replace(/^[/\\]+/, "")}`;

      const created = await invoke<ScannedPipelineYamlItemRust>(
        "create_local_pipeline_draft",
        {
          pipelinesDirPath: pipelinesFullPath,
          name,
          kind,
          executor: executor || (kind === "component" ? "blender" : undefined),
        },
      );

      return created;
    },
    onSuccess: (created) => {
      if (!created) return;
      queryClient.setQueryData(
        LOCAL_PIPELINES_QUERY_KEY(rootPath),
        (old: ScannedPipelineYamlItemRust[] | undefined) => {
          const list = old ? [...old] : [];
          const existingIdx = list.findIndex(
            (p) => p.fullPath === created.fullPath,
          );
          if (existingIdx >= 0) {
            list[existingIdx] = created;
          } else {
            list.push(created);
          }
          return list;
        },
      );
      queryClient.invalidateQueries({ queryKey: ["local-node-contracts", rootPath] });
    },
  });

  // Mutation Đổi tên Pipeline
  const renamePipelineMutation = useMutation({
    mutationFn: async ({
      filePath,
      newName,
    }: {
      filePath: string;
      newName: string;
    }) => {
      if (!isTauriRuntime()) return null;
      const { invoke } = await import("@tauri-apps/api/core");
      const updated = await invoke<ScannedPipelineYamlItemRust>(
        "rename_local_pipeline_draft",
        {
          filePath,
          newName,
        },
      );
      return { oldPath: filePath, updated };
    },
    onSuccess: (res) => {
      if (!res) return;
      queryClient.setQueryData(
        LOCAL_PIPELINES_QUERY_KEY(rootPath),
        (old: ScannedPipelineYamlItemRust[] | undefined) => {
          if (!old) return [res.updated];
          return old.map((p) => (p.fullPath === res.oldPath ? res.updated : p));
        },
      );
      queryClient.invalidateQueries({ queryKey: ["local-node-contracts", rootPath] });
    },
  });

  // Mutation Nhân bản (Duplicate)
  const duplicatePipelineMutation = useMutation({
    mutationFn: async (filePath: string) => {
      if (!isTauriRuntime()) return null;
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<ScannedPipelineYamlItemRust>(
        "duplicate_local_pipeline_draft",
        { filePath },
      );
    },
    onSuccess: (duplicated) => {
      if (!duplicated) return;
      queryClient.setQueryData(
        LOCAL_PIPELINES_QUERY_KEY(rootPath),
        (old: ScannedPipelineYamlItemRust[] | undefined) => {
          return old ? [...old, duplicated] : [duplicated];
        },
      );
    },
  });

  // Mutation Xóa Pipeline
  const deletePipelineMutation = useMutation({
    mutationFn: async (filePath: string) => {
      if (!isTauriRuntime()) return;
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_local_pipeline_draft", { filePath });
      return filePath;
    },
    onSuccess: (deletedPath) => {
      if (!deletedPath) return;
      queryClient.setQueryData(
        LOCAL_PIPELINES_QUERY_KEY(rootPath),
        (old: ScannedPipelineYamlItemRust[] | undefined) => {
          return old ? old.filter((p) => p.fullPath !== deletedPath) : [];
        },
      );
    },
  });

  // Mutation Lưu nội dung YAML Pipeline
  const savePipelineDraftMutation = useMutation({
    mutationFn: async ({
      filePath,
      content,
    }: {
      filePath: string;
      content: string;
    }) => {
      await saveLocalPipelineDraft(filePath, content);
      return { filePath, content };
    },
    onSuccess: ({ filePath, content }) => {
      queryClient.setQueryData(
        LOCAL_PIPELINES_QUERY_KEY(rootPath),
        (old: ScannedPipelineYamlItemRust[] | undefined) => {
          if (!old) return old;
          return old.map((p) =>
            p.fullPath === filePath ? { ...p, content } : p,
          );
        },
      );
    },
  });

  return {
    pipelines,
    componentPipes,
    masterPipelines,
    isLoading: query.isLoading,
    refetch: query.refetch,
    createPipeline: createPipelineMutation.mutateAsync,
    isCreating: createPipelineMutation.isPending,
    renamePipeline: renamePipelineMutation.mutateAsync,
    duplicatePipeline: duplicatePipelineMutation.mutateAsync,
    deletePipeline: deletePipelineMutation.mutateAsync,
    savePipelineDraft: savePipelineDraftMutation.mutateAsync,
  };
}
