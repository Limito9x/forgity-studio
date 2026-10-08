import { useCallback, useEffect } from "react";
import { useReactFlow } from "@xyflow/react";
import type { PinDefinition } from "@/gen/model";
import { isExecPin } from "../types";

interface UseDynamicPinsOptions {
  nodeId: string;
  refId: string;
  configValues?: Record<string, any>;
  inputs: PinDefinition[];
}

export function useDynamicPins({
  nodeId,
  refId,
  configValues,
  inputs,
}: UseDynamicPinsOptions) {
  const { setNodes } = useReactFlow();
  const rawRefId = (refId || "").toLowerCase();

  const isAppend = rawRefId === "appendstring" || rawRefId === "append";
  const isMakeArray = rawRefId === "makearray";
  const isMakeMap = rawRefId === "makemap";
  const isFormatString = rawRefId === "formatstring";

  // Auto-sync dynamic pins from Template string for FormatString node
  useEffect(() => {
    if (!isFormatString) return;
    const templateStr = String(
      configValues?.["Template"] ||
      configValues?.["template"] ||
      "{folder}/{name}"
    );

    const matches = Array.from(templateStr.matchAll(/\{([\w\-]+)\}/g)).map((m) => m[1]);
    const requiredSlots = Array.from(new Set(matches)).filter((s) => s.toLowerCase() !== "template");

    const currentInputs: PinDefinition[] = inputs || [];
    const nonSlotPins = currentInputs.filter((p) => p.id === "Template" || isExecPin(p));
    const newSlotPins: PinDefinition[] = [];
    let hasChange = false;

    for (const slot of requiredSlots) {
      const normSlot = slot.toLowerCase().replace(/[-_]/g, "");
      const existing = currentInputs.find((p) => (p.id || "").toLowerCase().replace(/[-_]/g, "") === normSlot);
      if (existing) {
        newSlotPins.push(existing);
      } else {
        hasChange = true;
        newSlotPins.push({
          id: slot,
          label: slot,
          primitiveType: 0 as any, // String
          cardinality: 0 as any,
          isRequired: false,
        });
      }
    }

    const currentSlotPins = currentInputs.filter((p) => p.id !== "Template" && !isExecPin(p));
    if (currentSlotPins.length !== newSlotPins.length) {
      hasChange = true;
    }

    if (hasChange) {
      const updatedInputs = [...nonSlotPins, ...newSlotPins];
      const dynamicPinIds = updatedInputs.map((p) => p.id || "").filter(Boolean);
      const currentConfig = configValues || {};
      const updatedConfig = { ...currentConfig, DynamicPins: dynamicPinIds };

      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, inputs: updatedInputs, configValues: updatedConfig } }
            : n
        )
      );
    }
  }, [nodeId, isFormatString, configValues, inputs, setNodes]);

  const handleAddPin = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n;
          const currentInputs: PinDefinition[] = (n.data as any).inputs || [];
          let updatedInputs = currentInputs;

          if (isAppend) {
            const letterPins = currentInputs.filter((p) => p.id !== "Separator" && p.id !== "exec_in");
            const nextCharCode = 65 + letterPins.length; // A = 65, B = 66, C = 67...
            const nextChar = String.fromCharCode(nextCharCode <= 90 ? nextCharCode : 65 + (letterPins.length % 26));
            const newPinId = letterPins.some((p) => p.id === nextChar) ? `${nextChar}_${letterPins.length}` : nextChar;

            const newPin: PinDefinition = {
              id: newPinId,
              label: newPinId,
              primitiveType: 0 as any, // String
              cardinality: 0 as any,
              isRequired: false,
            };

            updatedInputs = [...currentInputs, newPin];
          } else if (isMakeArray) {
            const newIndex = currentInputs.length + 1;
            const newPin: PinDefinition = {
              id: `Item_${newIndex}`,
              label: `Item ${newIndex}`,
              primitiveType: 0 as any,
              cardinality: 0 as any,
              isRequired: false,
            };
            updatedInputs = [...currentInputs, newPin];
          } else if (isMakeMap) {
            const keyPinsCount = currentInputs.filter((p) => (p.id || "").startsWith("Key_")).length;
            const nextIdx = keyPinsCount;
            const newKeyPin: PinDefinition = {
              id: `Key_${nextIdx}`,
              label: `Key ${nextIdx}`,
              primitiveType: 0 as any,
              cardinality: 0 as any,
              isRequired: false,
            };
            const newValPin: PinDefinition = {
              id: `Value_${nextIdx}`,
              label: `Value ${nextIdx}`,
              primitiveType: 0 as any,
              cardinality: 0 as any,
              isRequired: false,
            };
            updatedInputs = [...currentInputs, newKeyPin, newValPin];
          }

          const dynamicPinIds = updatedInputs.filter((p) => !isExecPin(p)).map((p) => p.id);
          const currentConfig = (n.data as any).configValues || {};
          const updatedConfig = { ...currentConfig, DynamicPins: dynamicPinIds };

          window.dispatchEvent(
            new CustomEvent("pipeline:update-node-config", {
              detail: { nodeId, configValues: updatedConfig },
            })
          );

          return {
            ...n,
            data: {
              ...n.data,
              inputs: updatedInputs,
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
          let updatedInputs = currentInputs;

          if (isMakeMap && pinId.startsWith("Key_")) {
            const suffix = pinId.replace("Key_", "");
            updatedInputs = currentInputs.filter((p) => p.id !== pinId && p.id !== `Value_${suffix}`);
          } else if (isMakeMap && pinId.startsWith("Value_")) {
            const suffix = pinId.replace("Value_", "");
            updatedInputs = currentInputs.filter((p) => p.id !== pinId && p.id !== `Key_${suffix}`);
          } else {
            updatedInputs = currentInputs.filter((p) => p.id !== pinId);
          }

          const dynamicPinIds = updatedInputs.filter((p) => !isExecPin(p)).map((p) => p.id);
          const currentConfig = (n.data as any).configValues || {};
          const updatedConfig = { ...currentConfig, DynamicPins: dynamicPinIds };

          window.dispatchEvent(
            new CustomEvent("pipeline:update-node-config", {
              detail: { nodeId, configValues: updatedConfig },
            })
          );

          return {
            ...n,
            data: {
              ...n.data,
              inputs: updatedInputs,
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
