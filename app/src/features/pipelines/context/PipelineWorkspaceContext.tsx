import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { NodePaletteItemDto, PinDefinition, StructDefinitionDto } from "@/gen/model";
import type { IPipelineStorageAdapter } from "../adapters/pipelineStorageAdapter";
import type { PipelineDiagnostic } from "../hooks/usePipelineGraph";

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

interface PipelineWorkspaceContextValue {
  mode: "local" | "cloud";
  projectId: string;
  rootPath?: string | null;
  storage: IPipelineStorageAdapter;
  paletteItems: NodePaletteItemDto[];
  structCatalogue: StructDefinitionDto[];
  isLoadingPalette: boolean;
  runners: any[];
  isLoadingRunners: boolean;
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

const PipelineWorkspaceContext = createContext<PipelineWorkspaceContextValue | null>(null);

export interface PipelineWorkspaceProviderProps {
  mode: "local" | "cloud";
  projectId: string;
  rootPath?: string | null;
  storage: IPipelineStorageAdapter;
  paletteItems?: NodePaletteItemDto[];
  structCatalogue?: readonly StructDefinitionDto[];
  isLoadingPalette?: boolean;
  runners?: readonly any[];
  isLoadingRunners?: boolean;
  resolveToolPins?: (
    params: ResolveToolPinsParams,
    signal?: AbortSignal
  ) => Promise<ResolveToolPinsResult | null>;
  validateGraph?: (
    snapshot: Record<string, unknown>,
    context: { nodes: Node[]; edges: Edge[] }
  ) => Promise<PipelineValidationSummary>;
  cancelExecution?: (executionId: string) => Promise<void> | void;
  children: ReactNode;
}

export function PipelineWorkspaceProvider({
  mode,
  projectId,
  rootPath,
  storage,
  paletteItems = [],
  structCatalogue = [],
  isLoadingPalette = false,
  runners = [],
  isLoadingRunners = false,
  resolveToolPins,
  validateGraph,
  cancelExecution,
  children,
}: PipelineWorkspaceProviderProps) {
  const value = useMemo<PipelineWorkspaceContextValue>(
    () => ({
      mode,
      projectId,
      rootPath,
      storage,
      paletteItems,
      structCatalogue: [...structCatalogue],
      isLoadingPalette,
      runners: [...runners],
      isLoadingRunners,
      resolveToolPins,
      validateGraph,
      cancelExecution,
    }),
    [
      mode,
      projectId,
      rootPath,
      storage,
      paletteItems,
      structCatalogue,
      isLoadingPalette,
      runners,
      isLoadingRunners,
      resolveToolPins,
      validateGraph,
      cancelExecution,
    ]
  );

  return (
    <PipelineWorkspaceContext.Provider value={value}>
      {children}
    </PipelineWorkspaceContext.Provider>
  );
}

export function usePipelineWorkspace(): PipelineWorkspaceContextValue {
  const ctx = useContext(PipelineWorkspaceContext);
  if (!ctx) {
    throw new Error("usePipelineWorkspace must be used within a PipelineWorkspaceProvider");
  }
  return ctx;
}

export function usePipelineWorkspaceOptional(): PipelineWorkspaceContextValue | null {
  return useContext(PipelineWorkspaceContext);
}

export const useOptionalPipelineWorkspace = usePipelineWorkspaceOptional;

