import type { PinDefinition, PipelineParameterDto } from "@/gen/model";
import type { FieldDefinition } from "@/lib/field-registry";
import { buildPinFieldContext, FIELD_ADAPTERS } from "./field-adapters/index.ts";

export interface PipelineInputLike {
  key: string;
  name?: string;
  label?: string;
  type: string | number;
  cardinality?: string | number;
  isRequired?: boolean;
  defaultValue?: any;
  structType?: string | null;
}

/**
 * Pure function adapter transforming PinDefinition into FormRenderer FieldDefinition
 * using the modular FieldAdapter registry.
 */
export function pinToFieldDefinition(
  pin: PinDefinition,
  configValues: Record<string, any> = {},
  overrides?: { name?: string; label?: string }
): FieldDefinition<any> {
  const ctx = buildPinFieldContext(pin, configValues);
  const matchedAdapter = FIELD_ADAPTERS.find((adapter) => adapter.match(ctx)) ?? FIELD_ADAPTERS[FIELD_ADAPTERS.length - 1];
  const fieldDef = matchedAdapter.create(ctx);

  fieldDef.properties = {
    ...fieldDef.properties,
    required: pin.isRequired === true,
  };

  if (overrides?.name) fieldDef.name = overrides.name;
  if (overrides?.label) fieldDef.label = overrides.label;

  return fieldDef;
}

/**
 * Adapter helper transforming PipelineParameterDto / PipelineInputLike into FormRenderer FieldDefinition
 */
export function pipelineInputToFieldDefinition(
  input: PipelineParameterDto | PipelineInputLike,
  configValues: Record<string, any> = {}
): FieldDefinition<any> {
  const structType = input.structType || (input as any).entityTarget || null;

  const pinDef: PinDefinition = {
    id: input.key,
    label: (input as any).label || (input as any).name || input.key,
    primitiveType: input.type as any,
    cardinality: (input.cardinality ?? "Single") as any,
    isRequired: input.isRequired,
    defaultValue: input.defaultValue,
    structType,
  };

  return pinToFieldDefinition(pinDef, configValues);
}
