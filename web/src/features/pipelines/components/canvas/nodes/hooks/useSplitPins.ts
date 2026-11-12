import { useMemo } from "react";
import type { PinDefinition } from "@/gen/model";
import { PinKind } from "@/gen/model";

export interface SplitPinsResult {
  execInputs: PinDefinition[];
  execOutputs: PinDefinition[];
  dataInputs: PinDefinition[];
  dataOutputs: PinDefinition[];
  showExecIn: boolean;
  showExecOut: boolean;
}

export function useSplitPins(
  inputs?: PinDefinition[],
  outputs?: PinDefinition[],
  forceExecIn = false
): SplitPinsResult {
  return useMemo(() => {
    const rawInputs = inputs ?? [];
    const rawOutputs = outputs ?? [];

    const execInputs = rawInputs.filter((p) => p.kind === PinKind.Exec || (p.kind as any) === 1 || p.id === "exec_in" || p.id === "exec");
    const execOutputs = rawOutputs.filter((p) => p.kind === PinKind.Exec || (p.kind as any) === 1 || p.id === "exec_out" || p.id === "exec");
    const dataInputs = rawInputs.filter((p) => p.kind !== PinKind.Exec && (p.kind as any) !== 1 && p.id !== "exec_in" && p.id !== "exec");
    const dataOutputs = rawOutputs.filter((p) => p.kind !== PinKind.Exec && (p.kind as any) !== 1 && p.id !== "exec_out" && p.id !== "exec");

    // Standard Tools default to having an Exec In and Exec Out handle unless explicitly a pure data node
    const hasCustomExecIn = execInputs.length > 0;
    const hasCustomExecOut = execOutputs.length > 0;

    const showExecIn = forceExecIn || hasCustomExecIn || true;
    const showExecOut = hasCustomExecOut || true;

    // If no custom exec output pins defined, provide default "exec_out" pin
    const finalExecOutputs = hasCustomExecOut
      ? execOutputs
      : [
          {
            id: "exec_out",
            label: "Exec",
            kind: PinKind.Exec,
            isRequired: false,
          } as PinDefinition,
        ];

    return {
      execInputs,
      execOutputs: finalExecOutputs,
      dataInputs,
      dataOutputs,
      showExecIn,
      showExecOut,
    };
  }, [inputs, outputs, forceExecIn]);
}
