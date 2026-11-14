import type { IPipelineStorageAdapter, PipelineRunOptions, PipelineStorageSaveResult } from "./pipelineStorageAdapter";
import type { ExtendedPipelineGraphDto } from "../hooks/usePipelineGraph";
import { runPipeline } from "@/gen/endpoints/pipelines/pipelines";

export interface CloudStorageAdapterConfig {
  projectId: string;
}

export class CloudPipelineStorageAdapter implements IPipelineStorageAdapter {
  readonly mode = "cloud" as const;

  constructor(_config: CloudStorageAdapterConfig) {}

  async loadGraph(_pipelineId: string): Promise<ExtendedPipelineGraphDto | null> {
    // Với Cloud mode, data query được quản lý chủ động qua usePipelineGraph hook của React Query
    return null;
  }

  async saveDraft(
    _pipelineId: string,
    _graph: ExtendedPipelineGraphDto
  ): Promise<PipelineStorageSaveResult> {
    return {
      success: false,
      message: "Cloud pipelines are immutable templates. Pull to Local Workspace to edit and republish.",
    };
  }

  async saveSnapshot(
    _pipelineId: string,
    _snapshotDto: ExtendedPipelineGraphDto
  ): Promise<PipelineStorageSaveResult> {
    return { success: true };
  }

  async run(options: PipelineRunOptions): Promise<any> {
    return await runPipeline(options.pipelineId, {
      preferredRunnerId: options.preferredRunnerId,
    });
  }
}
