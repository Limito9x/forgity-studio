import { useEffect, useMemo, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import type { PinDefinition } from "@/gen/model";
import { resolveToolPins } from "@/gen/endpoints/pipelines/pipelines";
import { arePinListsEqual, buildSchemaConfigSignature } from "../../../../nodeDefinitions";

interface UseNodePinResolverOptions {
  nodeId: string;
  refId: string;
  projectId?: string;
  configValues?: Record<string, unknown>;
  schemaConfigKeys?: readonly unknown[] | null;
  isDynamic?: boolean;
}

/**
 * Pure Data Hook: Synchronizes dynamic node pins with Backend C# Source of Truth.
 * Listens and debounces only on schema-affecting config keys (`schemaSignature`),
 * compares the full pin schema, and prunes orphan edges directionally.
 */
export function useNodePinResolver({
  nodeId,
  refId,
  projectId,
  configValues,
  schemaConfigKeys,
  isDynamic = true,
}: UseNodePinResolverOptions) {
  const { setNodes, setEdges } = useReactFlow();
  const lastResolvedSignatureRef = useRef<string>("");
  const latestConfigRef = useRef<Record<string, unknown> | undefined>(configValues);
  latestConfigRef.current = configValues;

  const schemaSignature = useMemo(
    () => buildSchemaConfigSignature(configValues, schemaConfigKeys),
    [configValues, schemaConfigKeys]
  );

  useEffect(() => {
    if (!isDynamic || !refId) return;
    if (schemaSignature === lastResolvedSignatureRef.current) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await resolveToolPins(
          {
            toolId: refId,
            configValues: latestConfigRef.current || {},
            projectId: projectId || undefined,
          },
          controller.signal
        );

        if (controller.signal.aborted) return;
        lastResolvedSignatureRef.current = schemaSignature;

        const newInputs = (result.inputs as PinDefinition[]) || [];
        const newOutputs = (result.outputs as PinDefinition[]) || [];

        // 1. Update Node Inputs & Outputs using full schema comparison
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            const currentInputs = (n.data as any).inputs || [];
            const currentOutputs = (n.data as any).outputs || [];

            const inputsChanged = !arePinListsEqual(currentInputs, newInputs);
            const outputsChanged = !arePinListsEqual(currentOutputs, newOutputs);

            if (!inputsChanged && !outputsChanged) return n;

            return {
              ...n,
              data: {
                ...n.data,
                inputs: newInputs,
                outputs: newOutputs,
              },
            };
          })
        );

        // 2. Directional Orphan Edge Pruning (inputs vs outputs separated)
        const validInputPinIds = new Set<string>(
          newInputs.map((p) => p.id!).filter(Boolean)
        );
        const validOutputPinIds = new Set<string>(
          newOutputs.map((p) => p.id!).filter(Boolean)
        );

        setEdges((edges) =>
          edges.filter((e) => {
            if (
              e.target === nodeId &&
              e.targetHandle &&
              !validInputPinIds.has(e.targetHandle)
            ) {
              return false;
            }
            if (
              e.source === nodeId &&
              e.sourceHandle &&
              !validOutputPinIds.has(e.sourceHandle)
            ) {
              return false;
            }
            return true;
          })
        );
      } catch (err: any) {
        if (controller.signal.aborted || err?.name === "CanceledError" || err?.name === "AbortError") {
          return;
        }
        console.error(`Failed to resolve dynamic pins for tool '${refId}':`, err);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [nodeId, refId, projectId, schemaSignature, isDynamic, setNodes, setEdges]);
}
