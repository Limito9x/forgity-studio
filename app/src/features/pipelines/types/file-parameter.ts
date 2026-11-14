/** Persisted file pin value; metadata is resolved through the link PK. */
export interface PipelineFileParameter {
  assetLinkId: string;
}

/** Confirmed upload waiting for the node save to create its link. */
export interface PipelineFileParameterDraft {
  assetId: string;
  originalName: string;
}

/** Imported file pin from bundle where original link could not be cloned (cross-studio / different storage). */
export interface PipelineFileParameterUnbound {
  status: "unbound";
  originalFileName?: string;
  hashSha256?: string;
  sizeBytes?: number;
  contentType?: string;
}

export type PipelineFileParameterValue =
  | PipelineFileParameter
  | PipelineFileParameterDraft
  | PipelineFileParameterUnbound
  | null;
