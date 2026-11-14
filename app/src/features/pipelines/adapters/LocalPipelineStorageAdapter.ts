import type { IPipelineStorageAdapter, PipelineRunOptions, PipelineStorageSaveResult } from "./pipelineStorageAdapter";
import type { ExtendedPipelineGraphDto } from "../hooks/usePipelineGraph";
import { loadLocalPipelineSnapshot, saveLocalPipelineSnapshot, saveLocalPipelineDraft } from "../hooks/workspace/useLocalPipelinesQuery";
import { graphToPipelineYaml } from "../utils/pipelineDslConverter";

export interface LocalStorageAdapterConfig {
  rootPath: string;
  pipelineSlug: string;
  filePath: string;
  onRunDraft?: (runtimeInputs?: Record<string, any>) => Promise<void> | void;
  onDraftSaved?: (graph: ExtendedPipelineGraphDto) => void;
}

export class LocalPipelineStorageAdapter implements IPipelineStorageAdapter {
  readonly mode = "local" as const;
  private config: LocalStorageAdapterConfig;

  constructor(config: LocalStorageAdapterConfig) {
    this.config = config;
  }

  async loadGraph(_pipelineId: string): Promise<ExtendedPipelineGraphDto | null> {
    const { rootPath, pipelineSlug } = this.config;
    if (!rootPath || !pipelineSlug) return null;

    try {
      const snapJson = await loadLocalPipelineSnapshot(rootPath, pipelineSlug);
      if (snapJson) {
        return JSON.parse(snapJson) as ExtendedPipelineGraphDto;
      }
    } catch (e) {
      console.warn("[LocalPipelineStorageAdapter] Failed to load local snapshot:", e);
    }
    return null;
  }

  async saveDraft(
    _pipelineId: string,
    graph: ExtendedPipelineGraphDto,
    rawYamlContent?: string
  ): Promise<PipelineStorageSaveResult> {
    const { rootPath, pipelineSlug, filePath } = this.config;
    try {
      // 1. Tự sinh nội dung YAML nếu chưa có
      const yaml =
        rawYamlContent ||
        graphToPipelineYaml(graph.name, graph.nodes as any, graph.edges as any);

      // 2. Lưu file .yaml trên đĩa
      await saveLocalPipelineDraft(filePath, yaml);

      // 3. Đồng bộ lưu snapshot .snap.json
      if (rootPath && pipelineSlug) {
        await saveLocalPipelineSnapshot(
          rootPath,
          pipelineSlug,
          JSON.stringify(graph, null, 2)
        );
      }

      this.config.onDraftSaved?.(graph);

      return { success: true };
    } catch (err: any) {
      return { success: false, message: err?.message || "Failed to save local draft" };
    }
  }

  async saveSnapshot(
    _pipelineId: string,
    snapshotDto: ExtendedPipelineGraphDto
  ): Promise<PipelineStorageSaveResult> {
    const { rootPath, pipelineSlug } = this.config;
    try {
      if (rootPath && pipelineSlug) {
        await saveLocalPipelineSnapshot(
          rootPath,
          pipelineSlug,
          JSON.stringify(snapshotDto, null, 2)
        );
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err?.message || "Failed to save local snapshot" };
    }
  }

  async run(options: PipelineRunOptions): Promise<any> {
    if (this.config.onRunDraft) {
      return this.config.onRunDraft((options as any)?.runtimeInputs);
    }
    throw new Error("No runner delegate provided for local execution");
  }
}
