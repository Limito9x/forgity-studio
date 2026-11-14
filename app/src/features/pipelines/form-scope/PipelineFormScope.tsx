import { createContext, useContext, useMemo } from "react";
import type { Node, Edge } from "@xyflow/react";
import type { PipelineParameterDto, PipelineDiagnostic } from "../hooks/usePipelineGraph";

export type ValidationStatus = "unvalidated" | "validating" | "valid" | "invalid" | "stale";

export interface PipelineDiagnosticsScope {
  diagnostics: PipelineDiagnostic[];
  diagnosticsByNodeId: Map<string, PipelineDiagnostic[]>;
  diagnosticsByPinKey: Map<string, PipelineDiagnostic[]>;
  graphLevelDiagnostics: PipelineDiagnostic[];
  errorCount: number;
  warningCount: number;
  validationStatus: ValidationStatus;
  isStale: boolean;
  isValidating: boolean;
  validateDraft: () => Promise<void>;
}

export interface PipelineFormScopeValue {
  pipelineId?: string;
  projectId?: string;
  parameters?: PipelineParameterDto[];
  variables?: PipelineParameterDto[];
  edges?: Edge[];
  nodes?: Node[];
  diagnosticsScope?: PipelineDiagnosticsScope;
}

const PipelineFormScopeContext = createContext<PipelineFormScopeValue | null>(null);

export function PipelineFormScopeProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: PipelineFormScopeValue;
}) {
  const memoizedValue = useMemo(() => value, [
    value.pipelineId,
    value.projectId,
    value.parameters,
    value.variables,
    value.edges,
    value.nodes,
    value.diagnosticsScope,
  ]);

  return (
    <PipelineFormScopeContext.Provider value={memoizedValue}>
      {children}
    </PipelineFormScopeContext.Provider>
  );
}

export function usePipelineFormScope(): PipelineFormScopeValue {
  const ctx = useContext(PipelineFormScopeContext);
  if (!ctx) {
    throw new Error("usePipelineFormScope must be used within a PipelineFormScopeProvider");
  }
  return ctx;
}

/**
 * Convenience hook to retrieve diagnostics specifically for a given node or pin.
 */
export function useNodeDiagnostics(nodeId?: string | null) {
  const { diagnosticsScope } = usePipelineFormScope();

  return useMemo(() => {
    if (!diagnosticsScope || !nodeId) {
      return {
        nodeDiagnostics: [] as PipelineDiagnostic[],
        errorCount: 0,
        warningCount: 0,
        hasErrors: false,
        hasWarnings: false,
        getPinDiagnostics: (_pinId: string) => [] as PipelineDiagnostic[],
      };
    }

    const nodeDiagnostics = diagnosticsScope.diagnosticsByNodeId.get(nodeId) ?? [];
    const errorCount = nodeDiagnostics.filter((d) => d.severity === "Error").length;
    const warningCount = nodeDiagnostics.filter((d) => d.severity === "Warning").length;

    const getPinDiagnostics = (pinId: string) => {
      const key = `${nodeId}:${pinId.toLowerCase()}`;
      return diagnosticsScope.diagnosticsByPinKey.get(key) ?? [];
    };

    return {
      nodeDiagnostics,
      errorCount,
      warningCount,
      hasErrors: errorCount > 0,
      hasWarnings: warningCount > 0,
      getPinDiagnostics,
    };
  }, [diagnosticsScope, nodeId]);
}
