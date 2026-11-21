import { useMemo } from "react";
import type {
  NodePaletteItemDto,
  PinDefinition,
} from "@/features/pipelines/types/pipelineGraphTypes";
import { PinKind } from "@/features/pipelines/types/pipelineGraphTypes";

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
  forceExecIn = false,
  definition?: NodePaletteItemDto
): SplitPinsResult {
  return useMemo(() => {
    // 1. When PaletteNodeContract execInputs/execOutputs/dataInputs/dataOutputs are explicitly provided, use them as SSOT
    if (definition && Array.isArray(definition.execInputs) && Array.isArray(definition.execOutputs)) {
      const execInputs: PinDefinition[] = definition.execInputs.map((p) => ({
        id: p.id,
        name: p.label || p.id,
        label: p.label,
        direction: "Input",
        kind: PinKind.Exec,
        isRequired: false,
      }));
      const execOutputs: PinDefinition[] = definition.execOutputs.map((p) => ({
        id: p.id,
        name: p.label || p.id,
        label: p.label,
        direction: "Output",
        kind: PinKind.Exec,
        isRequired: false,
      }));
      const dataInputs: PinDefinition[] = (definition.dataInputs ?? inputs ?? []).map((p: any) => ({
        ...p,
        name: p.name || p.label || p.id,
        direction: "Input",
        kind: PinKind.Data,
        primitiveType: p.dataType || p.primitiveType || "String",
      }));
      const dataOutputs: PinDefinition[] = (definition.dataOutputs ?? outputs ?? []).map((p: any) => ({
        ...p,
        name: p.name || p.label || p.id,
        direction: "Output",
        kind: PinKind.Data,
        primitiveType: p.dataType || p.primitiveType || "String",
      }));

      return {
        execInputs,
        execOutputs,
        dataInputs,
        dataOutputs,
        showExecIn: forceExecIn || execInputs.length > 0,
        showExecOut: execOutputs.length > 0,
      };
    }

    const rawInputs = inputs ?? [];
    const rawOutputs = outputs ?? [];

    const execInputs = rawInputs.filter((p) => p.kind === PinKind.Exec || (p.kind as any) === 1 || p.id === "exec_in" || p.id === "exec");
    const execOutputs = rawOutputs.filter((p) => p.kind === PinKind.Exec || (p.kind as any) === 1 || p.id === "exec_out" || p.id === "exec");
    const dataInputs = rawInputs.filter((p) => p.kind !== PinKind.Exec && (p.kind as any) !== 1 && p.id !== "exec_in" && p.id !== "exec");
    const dataOutputs = rawOutputs.filter((p) => p.kind !== PinKind.Exec && (p.kind as any) !== 1 && p.id !== "exec_out" && p.id !== "exec");

    const isPureOrConstant =
      definition?.viewVariant === "Constant" ||
      definition?.capabilities?.viewVariant === "Constant" ||
      definition?.capabilities?.isConstantNode === true ||
      definition?.executor?.toLowerCase() === "pure";

    const showExecIn = forceExecIn || execInputs.length > 0 || !isPureOrConstant;
    const showExecOut = execOutputs.length > 0 || !isPureOrConstant;

    const finalExecOutputs =
      execOutputs.length > 0
        ? execOutputs
        : showExecOut
        ? [
            {
              id: "exec_out",
              name: "Exec",
              direction: "Output",
              label: "Exec",
              kind: PinKind.Exec,
              isRequired: false,
            } as PinDefinition,
          ]
        : [];

    return {
      execInputs,
      execOutputs: finalExecOutputs,
      dataInputs,
      dataOutputs,
      showExecIn,
      showExecOut,
    };
  }, [inputs, outputs, forceExecIn, definition]);
}
