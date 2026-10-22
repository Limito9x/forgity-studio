import type { PinDefinition, StructDefinitionDto } from "@/gen/model";

/**
 * Tra cứu danh sách pins của một Struct từ Struct Catalogue do Backend cung cấp.
 * Single Source of Truth, không hardcode mảng tĩnh.
 */
export function getStructPins(
  structType: string,
  catalogue?: StructDefinitionDto[]
): PinDefinition[] {
  if (!structType || !catalogue || catalogue.length === 0) return [];
  const normalized = structType.trim().toLowerCase();
  const found = catalogue.find(
    (s) => s.structType?.toLowerCase() === normalized
  );
  return (found?.outputPins as PinDefinition[]) || [];
}

/**
 * Standard automatic pins provided by Start node when pipeline is in event trigger mode.
 */
export const EVENT_TRIGGER_START_PINS: PinDefinition[] = [
  {
    id: "Resources",
    label: "Resources",
    kind: "Data" as any,
    primitiveType: "EntityRef" as any,
    cardinality: "Array" as any,
    structType: "Resource",
  },
  {
    id: "Repository",
    label: "Repository",
    kind: "Data" as any,
    primitiveType: "EntityRef" as any,
    cardinality: "Single" as any,
    structType: "Repository",
  },
  {
    id: "Runner",
    label: "Runner",
    kind: "Data" as any,
    primitiveType: "EntityRef" as any,
    cardinality: "Single" as any,
    structType: "Runner",
  },
];

export function getStartNodeEventTriggerPins(): PinDefinition[] {
  return EVENT_TRIGGER_START_PINS.map((p) => ({ ...p }));
}
