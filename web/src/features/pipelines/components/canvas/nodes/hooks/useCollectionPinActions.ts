import { useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import type { PinDefinition, NodeCapabilitiesDto } from "@/gen/model";
import { isExecPin } from "../types";

interface UseCollectionPinActionsOptions {
  nodeId: string;
  capabilities?: NodeCapabilitiesDto | null;
}

/**
 * Pure UI Event Hook: Handles [+ Add Pin] and [x] click actions for collection-based nodes.
 * Driven entirely by Backend-provided NodeCapabilities (pinAddMode).
 */
export function useCollectionPinActions({
  nodeId,
  capabilities,
}: UseCollectionPinActionsOptions) {
  const { setNodes } = useReactFlow();
  const pinAddMode = capabilities?.pinAddMode || "Sequence";

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

          const nextDynamicPins = [...currentDynamic];

          if (pinAddMode === "Alpha") {
            const nextCharCode = 65 + currentDynamic.length;
            const nextChar = String.fromCharCode(
              nextCharCode <= 90 ? nextCharCode : 65 + (currentDynamic.length % 26)
            );
            const newPinId = currentDynamic.includes(nextChar)
              ? `${nextChar}_${currentDynamic.length}`
              : nextChar;
            nextDynamicPins.push(newPinId);
          } else if (pinAddMode === "Pair") {
            const keyCount = currentDynamic.filter((id) => id.startsWith("Key_")).length;
            nextDynamicPins.push(`Key_${keyCount}`, `Value_${keyCount}`);
          } else {
            // Default "Sequence" (MakeArray)
            const newIndex = currentDynamic.length + 1;
            nextDynamicPins.push(`Item_${newIndex}`);
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
    [nodeId, pinAddMode, setNodes]
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
          if (pinAddMode === "Pair" && pinId.startsWith("Key_")) {
            const suffix = pinId.replace("Key_", "");
            nextDynamicPins = currentDynamic.filter(
              (id) => id !== pinId && id !== `Value_${suffix}`
            );
          } else if (pinAddMode === "Pair" && pinId.startsWith("Value_")) {
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
    [nodeId, pinAddMode, setNodes]
  );

  return {
    canAddPin: Boolean(capabilities?.canAddPin),
    canRemovePin: Boolean(capabilities?.canRemovePin),
    handleAddPin,
    handleRemovePin,
  };
}
