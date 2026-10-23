import type { PinDefinition } from "@/gen/model";
import type { FieldDefinition } from "@/lib/field-registry";
import type { NormalizedPinType } from "./normalizePinType.ts";

export type NormalizedCardinality = "Single" | "Array" | "Map";

export interface PinMetadataHint {
  type?: string;
  options?: string[];
  multiple?: boolean;
  multiline?: boolean;
  rows?: number;
  entity?: string;
  properties?: Record<string, unknown>;
}

export interface PinFieldContext {
  pin: PinDefinition;
  pinId: string;
  label: string;
  primitive: NormalizedPinType;
  cardinality: NormalizedCardinality;
  structType: string | null;
  hint: PinMetadataHint | null;
  configValues: Record<string, unknown>;
}

export interface FieldAdapter {
  id: string;
  match(ctx: PinFieldContext): boolean;
  create(ctx: PinFieldContext): FieldDefinition<any>;
}
