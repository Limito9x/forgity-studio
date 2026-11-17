import type { Edge, Node } from "@xyflow/react";
import type {
  NodePaletteItemDto,
  PinDefinition,
  StructDefinitionDto,
} from "./pipelineGraphTypes";
import type { IPipelineStorageAdapter } from "../adapters/pipelineStorageAdapter";
import type { PipelineDiagnostic } from "../hooks/usePipelineGraph";

export type PipelineWorkspaceSource = "local" | "cloud";

export interface PipelineWorkspaceCapabilities {
  canEditGraph: boolean;
  canSaveDraft: boolean;
  canSaveSnapshot: boolean;
  canRun: boolean;
}

export interface ResolveToolPinsParams {
  toolId: string;
  configValues: Record<string, unknown>;
  projectId?: string;
}

export interface ResolveToolPinsResult {
  inputs?: PinDefinition[];
  outputs?: PinDefinition[];
}

export interface PipelineValidationSummary {
  isValid?: boolean;
  diagnostics: PipelineDiagnostic[];
  cycleNodeIds?: string[];
  unresolvedPins?: Array<{ pinLabel?: string; pinKey?: string }>;
}

export interface PipelineWorkspaceContract {
  source: PipelineWorkspaceSource;
  projectId: string;
  storage: IPipelineStorageAdapter;
  paletteItems: NodePaletteItemDto[];
  structCatalogue: StructDefinitionDto[];
  isLoadingPalette: boolean;
  capabilities: PipelineWorkspaceCapabilities;
  resolveToolPins?: (
    params: ResolveToolPinsParams,
    signal?: AbortSignal
  ) => Promise<ResolveToolPinsResult | null>;
  validateGraph?: (
    snapshot: Record<string, unknown>,
    context: { nodes: Node[]; edges: Edge[] }
  ) => Promise<PipelineValidationSummary>;
  cancelExecution?: (executionId: string) => Promise<void> | void;
}
