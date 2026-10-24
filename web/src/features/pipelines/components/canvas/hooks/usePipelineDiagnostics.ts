import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Node, Edge } from "@xyflow/react";
import { toast } from "sonner";
import type {
  ExtendedPipelineGraphDto,
  PipelineParameterDto,
  PipelineDiagnostic,
} from "../../../hooks/usePipelineGraph";
import { useValidatePipeline } from "../../../hooks/usePipelineGraph";
import type { PipelineDiagnosticsScope, ValidationStatus } from "../../../form-scope/PipelineFormScope";
import type { CustomPipelineNodeData } from "../nodes/types";

interface UsePipelineDiagnosticsOptions {
  graph: ExtendedPipelineGraphDto;
  nodes: Node[];
  edges: Edge[];
  parameters: PipelineParameterDto[];
  isDirty: boolean;
  lastSavedDiagnostics?: PipelineDiagnostic[] | null;
}

export function usePipelineDiagnostics({
  graph,
  nodes,
  edges,
  parameters,
  isDirty,
  lastSavedDiagnostics,
}: UsePipelineDiagnosticsOptions): PipelineDiagnosticsScope {
  // Initial diagnostics from graph DTO
  const initialDiagnostics = useMemo(() => {
    return (graph.diagnostics ?? []) as PipelineDiagnostic[];
  }, [graph.diagnostics]);

  const [diagnostics, setDiagnostics] = useState<PipelineDiagnostic[]>(initialDiagnostics);
  const [isStale, setIsStale] = useState<boolean>(false);
  const isInitialMount = useRef(true);

  // Sync initial graph diagnostics when pipeline ID changes
  useEffect(() => {
    setDiagnostics((graph.diagnostics ?? []) as PipelineDiagnostic[]);
    setIsStale(false);
  }, [graph.id, graph.diagnostics]);

  // When autosave returns freshly validated diagnostics from backend
  useEffect(() => {
    if (lastSavedDiagnostics !== undefined && lastSavedDiagnostics !== null) {
      setDiagnostics(lastSavedDiagnostics);
      setIsStale(false);
    }
  }, [lastSavedDiagnostics]);

  // When draft becomes dirty (user modified nodes/edges/parameters), mark diagnostics as stale
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (isDirty) {
      setIsStale(true);
    }
  }, [isDirty]);

  const validateMutation = useValidatePipeline(graph.id);

  // Helper to build draft snapshot payload matching backend expected format
  const buildDraftSnapshot = useCallback(() => {
    const nodeItems = nodes.map((node) => {
      const data = (node.data ?? {}) as CustomPipelineNodeData;
      return {
        id: node.id,
        refId: data.refId || node.id,
        kind: (data.kind as any) || "Tool",
        positionX: node.position.x,
        positionY: node.position.y,
        configValues: data.configValues || {},
        parentId: node.parentId || null,
        size: node.style ? { width: Number(node.style.width) || 0, height: Number(node.style.height) || 0 } : null,
        metadata: data.metadata || null,
      };
    });

    const edgeItems = edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.source,
      sourcePin: edge.sourceHandle || "",
      targetNodeId: edge.target,
      targetPin: edge.targetHandle || "",
    }));

    return {
      nodes: nodeItems as unknown as unknown[],
      edges: edgeItems as unknown as unknown[],
      parameters: parameters as unknown as unknown[],
      runtimeInputs: {},
    };
  }, [nodes, edges, parameters]);

  const validateDraft = useCallback(async () => {
    try {
      const payload = buildDraftSnapshot();
      const res = await validateMutation.mutateAsync(payload);

      const receivedDiagnostics = (res.diagnostics ?? []) as PipelineDiagnostic[];
      setDiagnostics(receivedDiagnostics);
      setIsStale(false);

      if (res.isValid) {
        toast.success("Pipeline graph is valid with no unresolved dependencies.");
      } else {
        const errorItems = receivedDiagnostics.filter((d) => d.severity === "Error");
        if (errorItems.length > 0) {
          toast.error(`Validation found ${errorItems.length} error(s). Review highlighted nodes.`);
        } else if (res.cycleNodeIds && res.cycleNodeIds.length > 0) {
          toast.error(`Pipeline contains a cycle involving nodes: ${res.cycleNodeIds.join(", ")}`);
        } else if (res.unresolvedPins && res.unresolvedPins.length > 0) {
          toast.error(`Unresolved required pins: ${res.unresolvedPins.map((p) => p.pinLabel || p.pinKey).join(", ")}`);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Validation failed";
      toast.error(msg);
    }
  }, [buildDraftSnapshot, validateMutation]);

  // Filter diagnostics to remove ghost entries for deleted nodes
  const activeNodeIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  const activeDiagnostics = useMemo(() => {
    return diagnostics.filter((d) => !d.nodeId || activeNodeIds.has(d.nodeId));
  }, [diagnostics, activeNodeIds]);

  // Index diagnostics by nodeId
  const diagnosticsByNodeId = useMemo(() => {
    const map = new Map<string, PipelineDiagnostic[]>();
    for (const d of activeDiagnostics) {
      if (d.nodeId) {
        const existing = map.get(d.nodeId);
        if (existing) {
          existing.push(d);
        } else {
          map.set(d.nodeId, [d]);
        }
      }
    }
    return map;
  }, [activeDiagnostics]);

  // Index diagnostics by pinKey (`${nodeId}:${pinId.toLowerCase()}`)
  const diagnosticsByPinKey = useMemo(() => {
    const map = new Map<string, PipelineDiagnostic[]>();
    for (const d of activeDiagnostics) {
      if (d.nodeId && d.pinId) {
        const key = `${d.nodeId}:${d.pinId.toLowerCase()}`;
        const existing = map.get(key);
        if (existing) {
          existing.push(d);
        } else {
          map.set(key, [d]);
        }
      }
    }
    return map;
  }, [activeDiagnostics]);

  // Graph-level diagnostics (no nodeId or cycle detected across graph)
  const graphLevelDiagnostics = useMemo(() => {
    return activeDiagnostics.filter((d) => !d.nodeId);
  }, [activeDiagnostics]);

  const errorCount = useMemo(() => {
    return activeDiagnostics.filter((d) => d.severity === "Error").length;
  }, [activeDiagnostics]);

  const warningCount = useMemo(() => {
    return activeDiagnostics.filter((d) => d.severity === "Warning").length;
  }, [activeDiagnostics]);

  const validationStatus: ValidationStatus = useMemo(() => {
    if (validateMutation.isPending) return "validating";
    if (isStale) return "stale";
    if (errorCount > 0) return "invalid";
    return "valid";
  }, [validateMutation.isPending, isStale, errorCount]);

  return {
    diagnostics: activeDiagnostics,
    diagnosticsByNodeId,
    diagnosticsByPinKey,
    graphLevelDiagnostics,
    errorCount,
    warningCount,
    validationStatus,
    isStale,
    isValidating: validateMutation.isPending,
    validateDraft,
  };
}

