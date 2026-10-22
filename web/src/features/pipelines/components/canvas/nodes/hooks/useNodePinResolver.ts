import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import type { PinDefinition } from "@/gen/model";
import { resolveToolPins } from "@/gen/endpoints/pipelines/pipelines";

interface UseNodePinResolverOptions {
  nodeId: string;
  refId: string;
  configValues?: Record<string, any>;
  isDynamic?: boolean;
}

/**
 * Pure Data Hook: Synchronizes dynamic node pins with Backend C# Source of Truth.
 * Automatically prunes orphan edges when pins are removed or restructured.
 */
export function useNodePinResolver({
  nodeId,
  refId,
  configValues,
  isDynamic = true,
}: UseNodePinResolverOptions) {
  const { setNodes, setEdges } = useReactFlow();
  const lastResolvedConfigRef = useRef<string>("");

  useEffect(() => {
    if (!isDynamic || !refId) return;

    const configStr = JSON.stringify(configValues || {});
    if (configStr === lastResolvedConfigRef.current) return;

    const timer = setTimeout(async () => {
      try {
        lastResolvedConfigRef.current = configStr;
        const result = await resolveToolPins({
          toolId: refId,
          configValues: configValues || {},
        });

        const newInputs = (result.inputs as PinDefinition[]) || [];
        const newOutputs = (result.outputs as PinDefinition[]) || [];

        // 1. Update Node Inputs & Outputs
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            const currentInputs = (n.data as any).inputs || [];
            const currentOutputs = (n.data as any).outputs || [];

            const inputsChanged =
              currentInputs.length !== newInputs.length ||
              newInputs.some((p, i) => p.id !== currentInputs[i]?.id);
            const outputsChanged =
              currentOutputs.length !== newOutputs.length ||
              newOutputs.some((p, i) => p.id !== currentOutputs[i]?.id);

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

        // 2. Safety Rule 6.5: Prune Orphan Edges connected to deleted pins
        const validPinIds = new Set<string>([
          ...newInputs.map((p) => p.id!).filter(Boolean),
          ...newOutputs.map((p) => p.id!).filter(Boolean),
        ]);

        setEdges((edges) =>
          edges.filter((e) => {
            if (e.target === nodeId && e.targetHandle && !validPinIds.has(e.targetHandle)) {
              return false;
            }
            if (e.source === nodeId && e.sourceHandle && !validPinIds.has(e.sourceHandle)) {
              return false;
            }
            return true;
          })
        );
      } catch (err) {
        console.error(`Failed to resolve dynamic pins for tool '${refId}':`, err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [nodeId, refId, configValues, isDynamic, setNodes, setEdges]);
}
