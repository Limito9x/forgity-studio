import { useCallback, useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import type { PinDefinition } from "@/gen/model";
import { resolveToolPins } from "@/gen/endpoints/pipelines/pipelines";
import { isExecPin } from "../types";

interface UseDynamicPinsOptions {
  nodeId: string;
  refId: string;
  configValues?: Record<string, any>;
}

export function useDynamicPins({
  nodeId,
  refId,
  configValues,
}: UseDynamicPinsOptions) {
  const { setNodes } = useReactFlow();
  const rawRefId = (refId || "").toLowerCase();

  const isAppend = rawRefId === "appendstring" || rawRefId === "append";
  const isMakeArray = rawRefId === "makearray";
  const isMakeMap = rawRefId === "makemap";
  const isFormatString = rawRefId === "formatstring";

  // Serialized config cache to prevent duplicate resolve calls
  const lastResolvedConfigRef = useRef<string>("");

  // Backend-Authoritative Pin Resolver with 250ms debounce
  useEffect(() => {
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

        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== nodeId) return n;
            const currentInputs = (n.data as any).inputs || [];
            const currentOutputs = (n.data as any).outputs || [];

            // Quick shallow diff check to avoid unnecessary re-renders
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
      } catch (err) {
        console.error(`Failed to resolve dynamic pins for tool '${refId}':`, err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [nodeId, refId, configValues, setNodes]);

  const handleAddPin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const currentInputs: PinDefinition[] = (n.data as any).inputs || [];
          const currentDynamic: string[] = currentInputs
            .filter((p) => !isExecPin(p) && p.id !== "Separator" && Boolean(p.id))
            .map((p) => p.id as string);

          let nextDynamicPins = [...currentDynamic];

          if (isAppend) {
            const nextCharCode = 65 + currentDynamic.length;
            const nextChar = String.fromCharCode(
              nextCharCode <= 90 ? nextCharCode : 65 + (currentDynamic.length % 26)
            );
            const newPinId = currentDynamic.includes(nextChar)
              ? `${nextChar}_${currentDynamic.length}`
              : nextChar;
            nextDynamicPins.push(newPinId);
          } else if (isMakeArray) {
            const newIndex = currentDynamic.length + 1;
            nextDynamicPins.push(`Item_${newIndex}`);
          } else if (isMakeMap) {
            const keyCount = currentDynamic.filter((id) => id?.startsWith("Key_")).length;
            nextDynamicPins.push(`Key_${keyCount}`, `Value_${keyCount}`);
          }

          const currentConfig = (n.data as any).configValues || {};
          const updatedConfig = { ...currentConfig, DynamicPins: nextDynamicPins };

          window.dispatchEvent(
            new CustomEvent("pipeline:update-node-config", {
              detail: { nodeId, configValues: updatedConfig },
            })
          );

          return {
            ...n,
            data: {
              ...n.data,
              configValues: updatedConfig,
            },
          };
        })
      );
    },
    [nodeId, isAppend, isMakeArray, isMakeMap, setNodes]
  );

  const handleRemovePin = useCallback(
    (e: React.MouseEvent, pinId: string) => {
      e.stopPropagation();
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const currentInputs: PinDefinition[] = (n.data as any).inputs || [];
          const currentDynamic: string[] = currentInputs
            .filter((p) => !isExecPin(p) && p.id !== "Separator" && Boolean(p.id))
            .map((p) => p.id as string);

          let nextDynamicPins: string[];
          if (isMakeMap && pinId.startsWith("Key_")) {
            const suffix = pinId.replace("Key_", "");
            nextDynamicPins = currentDynamic.filter(
              (id) => id !== pinId && id !== `Value_${suffix}`
            );
          } else if (isMakeMap && pinId.startsWith("Value_")) {
            const suffix = pinId.replace("Value_", "");
            nextDynamicPins = currentDynamic.filter(
              (id) => id !== pinId && id !== `Key_${suffix}`
            );
          } else {
            nextDynamicPins = currentDynamic.filter((id) => id !== pinId);
          }

          const currentConfig = (n.data as any).configValues || {};
          const updatedConfig = { ...currentConfig, DynamicPins: nextDynamicPins };

          window.dispatchEvent(
            new CustomEvent("pipeline:update-node-config", {
              detail: { nodeId, configValues: updatedConfig },
            })
          );

          return {
            ...n,
            data: {
              ...n.data,
              configValues: updatedConfig,
            },
          };
        })
      );
    },
    [nodeId, isMakeMap, setNodes]
  );

  return {
    isAppend,
    isMakeArray,
    isMakeMap,
    isFormatString,
    canAddDynamicPin: isAppend || isMakeArray || isMakeMap,
    handleAddPin,
    handleRemovePin,
  };
}
