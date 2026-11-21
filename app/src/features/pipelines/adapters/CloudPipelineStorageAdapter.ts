import type {
  IPipelineStorageAdapter,
  PipelineRunOptions,
  PipelineStorageSaveResult,
} from "./pipelineStorageAdapter";
import type { ExtendedPipelineGraphDto } from "../hooks/usePipelineGraph";

export interface CloudStorageAdapterConfig {
  projectId: string;
  loadGraph?: (
    pipelineId: string
  ) => Promise<ExtendedPipelineGraphDto | null>;
  saveDraft?: (
    pipelineId: string,
    graph: ExtendedPipelineGraphDto,
    rawYamlContent?: string
  ) => Promise<PipelineStorageSaveResult>;
  saveSnapshot?: (
    pipelineId: string,
    snapshotDto: ExtendedPipelineGraphDto
  ) => Promise<PipelineStorageSaveResult>;
  run?: (options: PipelineRunOptions) => Promise<unknown>;
}

export class CloudPipelineStorageAdapter implements IPipelineStorageAdapter {
  readonly source = "cloud" as const;
  private readonly config: CloudStorageAdapterConfig;

  constructor(config: CloudStorageAdapterConfig) {
    this.config = config;
  }

  async loadGraph(
    pipelineId: string,
  ): Promise<ExtendedPipelineGraphDto | null> {
    if (this.config.loadGraph) {
      return this.config.loadGraph(pipelineId);
    }

    return null;
  }

  async saveDraft(
    pipelineId: string,
    graph: ExtendedPipelineGraphDto,
    rawYamlContent?: string,
  ): Promise<PipelineStorageSaveResult> {
    if (this.config.saveDraft) {
      return this.config.saveDraft(pipelineId, graph, rawYamlContent);
    }

    return {
      success: false,
      message: "Cloud draft saving is not configured for this workspace.",
    };
  }

  async saveSnapshot(
    pipelineId: string,
    snapshotDto: ExtendedPipelineGraphDto,
  ): Promise<PipelineStorageSaveResult> {
    if (this.config.saveSnapshot) {
      return this.config.saveSnapshot(pipelineId, snapshotDto);
    }

    return {
      success: false,
      message: "Cloud snapshot saving is not configured for this workspace.",
    };
  }

  async run(options: PipelineRunOptions): Promise<unknown> {
    if (this.config.run) {
      return this.config.run(options);
    }

    throw new Error("Cloud execution is not configured for this workspace.");
  }
}
