import type { ExtendedPipelineGraphDto } from "../hooks/usePipelineGraph";

export interface PipelineStorageSaveResult {
  success: boolean;
  message?: string;
}

export interface PipelineRunOptions {
  projectId: string;
  pipelineId: string;
  runtimeInputs?: Record<string, unknown>;
}

/**
 * Strategy Interface trừu tượng hóa toàn bộ tương tác lưu trữ & thực thi pipeline:
 * - Local mode: File System, Tauri IPC (.yaml, .snap.json)
 * - Cloud mode: FastEndpoints API, EF Core PostgreSQL
 */
export interface IPipelineStorageAdapter {
  readonly source: "local" | "cloud";

  /**
   * Tải đồ thị ban đầu
   */
  loadGraph(pipelineId: string): Promise<ExtendedPipelineGraphDto | null>;

  /**
   * Lưu bản nháp đồ thị (Debounced Auto-save)
   */
  saveDraft(
    pipelineId: string,
    graph: ExtendedPipelineGraphDto,
    rawYamlContent?: string
  ): Promise<PipelineStorageSaveResult>;

  /**
   * Lưu snapshot tường minh
   */
  saveSnapshot(
    pipelineId: string,
    snapshotDto: ExtendedPipelineGraphDto
  ): Promise<PipelineStorageSaveResult>;

  /**
   * Khởi chạy thực thi trên desktop hiện tại.
   */
  run(options: PipelineRunOptions): Promise<any>;
}
