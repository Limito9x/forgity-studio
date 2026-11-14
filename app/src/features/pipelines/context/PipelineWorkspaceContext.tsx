import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { IPipelineStorageAdapter } from "../adapters/pipelineStorageAdapter";

interface PipelineWorkspaceContextValue {
  mode: "local" | "cloud";
  projectId: string;
  rootPath?: string | null;
  storage: IPipelineStorageAdapter;
}

const PipelineWorkspaceContext = createContext<PipelineWorkspaceContextValue | null>(null);

export interface PipelineWorkspaceProviderProps {
  mode: "local" | "cloud";
  projectId: string;
  rootPath?: string | null;
  storage: IPipelineStorageAdapter;
  children: ReactNode;
}

export function PipelineWorkspaceProvider({
  mode,
  projectId,
  rootPath,
  storage,
  children,
}: PipelineWorkspaceProviderProps) {
  const value = useMemo(
    () => ({
      mode,
      projectId,
      rootPath,
      storage,
    }),
    [mode, projectId, rootPath, storage]
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

