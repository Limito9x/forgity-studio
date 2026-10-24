import { useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { resolveToolPins } from "@/gen/endpoints/pipelines/pipelines";
import type { PinDefinition } from "@/gen/model";
import {
  arePinListsEqual,
  buildSchemaConfigSignature,
} from "../../../../nodeDefinitions";

interface UseNodePinResolverOptions {
  nodeId: string;
  refId: string;
  projectId?: string;
  configValues?: Record<string, unknown>;
  schemaConfigKeys?: readonly unknown[] | null;
  hasDynamicPins?: boolean;
}

/**
 * Automatically calls `POST /api/pipelines/tools/resolve-pins` when a node's
 * schema-affecting configuration changes. Updates the React Flow node's `inputs`
 * and `outputs`, and prunes edges connecting to dynamic pins that were removed.
 */
export function useNodePinResolver({
  nodeId,
  refId,
  projectId,
  configValues,
  schemaConfigKeys,
  hasDynamicPins = true,
}: UseNodePinResolverOptions) {
  const { setNodes, setEdges } = useReactFlow();
  const lastResolvedSignatureRef = useRef<string>("");
  const latestConfigRef = useRef(configValues);
  latestConfigRef.current = configValues;

  const schemaSignature = buildSchemaConfigSignature(
    configValues,
    schemaConfigKeys
  );

  useEffect(() => {
    if (!hasDynamicPins || !refId) return;
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

        lastResolvedSignatureRef.current = schemaSignature;

        if (!result) return;

        const newInputs = (result.inputs ?? []) as PinDefinition[];
        const newOutputs = (result.outputs ?? []) as PinDefinition[];

        setNodes((nds) =>
          nds.map((node) => {
            if (node.id !== nodeId) return node;

            const curInputs = (node.data?.inputs as PinDefinition[] | undefined) ?? [];
            const curOutputs = (node.data?.outputs as PinDefinition[] | undefined) ?? [];

            if (
              arePinListsEqual(curInputs, newInputs) &&
              arePinListsEqual(curOutputs, newOutputs)
            ) {
              return node;
            }

            return {
              ...node,
              data: {
                ...node.data,
                inputs: newInputs,
                outputs: newOutputs,
              },
            };
          })
        );

        const validPinKeys = new Set<string>([
          ...newInputs.map((p) => p.id?.toLowerCase()).filter(Boolean) as string[],
          ...newInputs.map((p) => p.label?.toLowerCase()).filter(Boolean) as string[],
          ...newOutputs.map((p) => p.id?.toLowerCase()).filter(Boolean) as string[],
          ...newOutputs.map((p) => p.label?.toLowerCase()).filter(Boolean) as string[],
          "exec_in",
          "exec_out",
          "exec",
        ]);

        setEdges((eds) =>
          eds.filter((edge) => {
            if (edge.source === nodeId) {
              return validPinKeys.has(edge.sourceHandle?.toLowerCase() ?? "");
            }
            if (edge.target === nodeId) {
              return validPinKeys.has(edge.targetHandle?.toLowerCase() ?? "");
            }
            return true;
          })
        );
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "CanceledError") return;
        console.error(`Failed to resolve dynamic pins for tool '${refId}':`, err);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [nodeId, refId, projectId, schemaSignature, hasDynamicPins, setNodes, setEdges]);
}
