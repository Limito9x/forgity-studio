/** Persisted file pin value; metadata is resolved through the link PK. */
export interface PipelineFileParameter {
  assetLinkId: string;
}

/** Confirmed upload waiting for the node save to create its link. */
export interface PipelineFileParameterDraft {
  assetId: string;
  originalName: string;
}

export type PipelineFileParameterValue =
  | PipelineFileParameter
  | PipelineFileParameterDraft
  | null;
