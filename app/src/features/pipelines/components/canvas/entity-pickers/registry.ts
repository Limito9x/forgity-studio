import type { ComponentType } from "react";
import type { EntityPickerProps } from "./types";
import { RunnerPicker } from "./pickers/RunnerPicker";
import { ContentTypePicker } from "./pickers/ContentTypePicker";
import { ContentItemPicker } from "./pickers/ContentItemPicker";
import { GenericEntityPicker } from "./pickers/GenericEntityPicker";

export const ENTITY_PICKER_REGISTRY: Record<string, ComponentType<EntityPickerProps>> = {
  Runner: RunnerPicker,
  ContentType: ContentTypePicker,
  ContentItem: ContentItemPicker,
};

export function getEntityPicker(entityType: string): ComponentType<EntityPickerProps> {
  const normalizedKey = (entityType || "").trim();
  return ENTITY_PICKER_REGISTRY[normalizedKey] ?? GenericEntityPicker;
}
