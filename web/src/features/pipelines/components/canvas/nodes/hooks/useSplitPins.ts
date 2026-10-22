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

    const execInputs = rawInputs.filter((p) => p.kind === PinKind.Exec);
    const execOutputs = rawOutputs.filter((p) => p.kind === PinKind.Exec);
    const dataInputs = rawInputs.filter((p) => p.kind === PinKind.Data);
    const dataOutputs = rawOutputs.filter((p) => p.kind === PinKind.Data);

    const showExecIn = forceExecIn || execInputs.length > 0;
    const showExecOut = execOutputs.length > 0;

    return {
      execInputs,
      execOutputs,
      dataInputs,
      dataOutputs,
      showExecIn,
      showExecOut,
    };
  }, [inputs, outputs, forceExecIn]);
}
