import type {
  PipelineParameterDto,
  PinDefinition,
  PinDirection,
} from "../types/pipelineGraphTypes";

export function getPipelineParameterPinId(parameter: PipelineParameterDto): string {
  return String(parameter.key || parameter.name || parameter.id || "");
}

export function pipelineParameterToPin(
  parameter: PipelineParameterDto,
  direction: PinDirection,
): PinDefinition {
  const id = getPipelineParameterPinId(parameter);
  const label = String(parameter.label || parameter.name || parameter.key || parameter.id || "");
  const rawMetadata = parameter.contextData ?? parameter.metadata;

  return {
    id,
    name: id,
    direction,
    label,
    kind: "Data",
    primitiveType: String(parameter.type ?? parameter.primitiveType ?? "String"),
    cardinality: String(parameter.cardinality ?? "Single"),
    structType: parameter.structType ?? null,
    metadata:
      rawMetadata == null
        ? undefined
        : typeof rawMetadata === "string"
          ? rawMetadata
          : JSON.stringify(rawMetadata),
    defaultValue: parameter.defaultValue,
    description: parameter.description,
    isRequired: Boolean(parameter.isRequired),
  };
}
