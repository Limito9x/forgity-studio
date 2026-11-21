import { createContext, useContext, type ReactNode } from "react";
import type { PipelineWorkspaceContract } from "../types/pipelineWorkspaceContract";

export type {
  PipelineValidationSummary,
  ResolveToolPinsParams,
  ResolveToolPinsResult,
} from "../types/pipelineWorkspaceContract";

const PipelineWorkspaceContext = createContext<PipelineWorkspaceContract | null>(null);

export interface PipelineWorkspaceProviderProps {
  workspace: PipelineWorkspaceContract;
  children: ReactNode;
}

export function PipelineWorkspaceProvider({
  workspace,
  children,
}: PipelineWorkspaceProviderProps) {
  return (
    <PipelineWorkspaceContext.Provider value={workspace}>
      {children}
    </PipelineWorkspaceContext.Provider>
  );
}

export function usePipelineWorkspace(): PipelineWorkspaceContract {
  const ctx = useContext(PipelineWorkspaceContext);
  if (!ctx) {
    throw new Error("usePipelineWorkspace must be used within a PipelineWorkspaceProvider");
  }
  return ctx;
}

export function usePipelineWorkspaceOptional(): PipelineWorkspaceContract | null {
  return useContext(PipelineWorkspaceContext);
}

export const useOptionalPipelineWorkspace = usePipelineWorkspaceOptional;

