import type { ComponentType } from "react";
import type { EntityPickerProps } from "./types";
import { ResourcePicker } from "./pickers/ResourcePicker";
import { RunnerPicker } from "./pickers/RunnerPicker";
import { RepositoryPicker } from "./pickers/RepositoryPicker";
import { TagPicker } from "./pickers/TagPicker";
import { ContentTypePicker } from "./pickers/ContentTypePicker";
import { ContentItemPicker } from "./pickers/ContentItemPicker";
import { GenericEntityPicker } from "./pickers/GenericEntityPicker";

export const ENTITY_PICKER_REGISTRY: Record<string, ComponentType<EntityPickerProps>> = {
  Resource: ResourcePicker,
  Runner: RunnerPicker,
  Repository: RepositoryPicker,
  Tag: TagPicker,
  ContentType: ContentTypePicker,
  ContentItem: ContentItemPicker,
};

export function getEntityPicker(entityType: string): ComponentType<EntityPickerProps> {
  const normalizedKey = (entityType || "").trim();
  return ENTITY_PICKER_REGISTRY[normalizedKey] ?? GenericEntityPicker;
}

