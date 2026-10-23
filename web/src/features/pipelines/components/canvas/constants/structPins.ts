import type { PinDefinition } from "@/gen/model";

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
