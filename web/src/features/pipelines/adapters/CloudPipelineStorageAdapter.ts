import type { IPipelineStorageAdapter, PipelineRunOptions, PipelineStorageSaveResult } from "./pipelineStorageAdapter";
import type { ExtendedPipelineGraphDto, SavePipelineNodeItem, SavePipelineEdgeItem } from "../hooks/usePipelineGraph";
import { savePipelineGraph, runPipeline } from "@/gen/endpoints/pipelines/pipelines";

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
    pipelineId: string,
    graph: ExtendedPipelineGraphDto
  ): Promise<PipelineStorageSaveResult> {
    try {
      const saveNodes: SavePipelineNodeItem[] = (graph.nodes || []).map((n) => ({
        id: n.id,
        refId: String(n.refId || n.id),
        kind: n.kind,
        positionX: n.position?.x ?? 0,
        positionY: n.position?.y ?? 0,
        configValues: n.configValues || {},
      }));

      const saveEdges: SavePipelineEdgeItem[] = (graph.edges || []).map((e) => ({
        id: e.id,
        sourceNodeId: e.sourceNodeId,
        sourcePin: e.sourcePin || "out",
        targetNodeId: e.targetNodeId,
        targetPin: e.targetPin || "in",
      }));

      await savePipelineGraph(pipelineId, {
        nodes: saveNodes,
        edges: saveEdges,
        parameters: graph.parameters as any,
      });

      return { success: true };
    } catch (err: any) {
      return { success: false, message: err?.message || "Failed to save cloud graph" };
    }
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
