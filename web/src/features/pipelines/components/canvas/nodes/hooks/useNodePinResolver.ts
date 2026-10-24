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
  hasDynamicPins?: boolean;
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
  hasDynamicPins = true,
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
          { signal: controller.signal }
        );

        lastResolvedSignatureRef.current = schemaSignature;

        if (!result.data.isSuccess || !result.data.value) {
          return;
        }

        const newInputs = (result.data.value.inputs ?? []) as PinDefinition[];
        const newOutputs = (result.data.value.outputs ?? []) as PinDefinition[];

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
          ...newInputs.map((p) => p.id.toLowerCase()),
          ...newInputs.map((p) => p.label.toLowerCase()),
          ...newOutputs.map((p) => p.id.toLowerCase()),
          ...newOutputs.map((p) => p.label.toLowerCase()),
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
