import type { PinDefinition } from "@/features/pipelines/types/pipelineGraphTypes";

/**
 * Standard automatic pins provided by Start node when pipeline is in event trigger mode.
 */
export const EVENT_TRIGGER_START_PINS: PinDefinition[] = [
  {
    id: "Resources",
    name: "Resources",
    direction: "Output",
    label: "Resources",
    kind: "Data" as any,
    primitiveType: "EntityRef" as any,
    cardinality: "Array" as any,
    structType: "Resource",
  },
  {
    id: "Workstation",
    name: "Workstation",
    direction: "Output",
    label: "Workstation",
    kind: "Data" as any,
    primitiveType: "EntityRef" as any,
    cardinality: "Single" as any,
    structType: "Workstation",
  },
];

export function getStartNodeEventTriggerPins(): PinDefinition[] {
  return EVENT_TRIGGER_START_PINS.map((p) => ({ ...p }));
}
