import type { PinDefinition } from "@/gen/model";
import type { FieldDefinition } from "@/lib/field-registry";
import {
  normalizePinType,
  type NormalizedPinType,
} from "../hooks/usePinCatalogue";
import { isVariablePin } from "../components/canvas/CustomPipelineNode";

export interface PinFieldRule {
  predicate: (pin: PinDefinition, normType: NormalizedPinType, idLower: string) => boolean;
  create: (
    pin: PinDefinition,
    normType: NormalizedPinType,
    configValues: Record<string, any>
  ) => FieldDefinition<any>;
}

export function resolveEntityTargetFromPin(
  pin: PinDefinition,
  configValues: Record<string, any>
): string {
  if (pin.entityTarget) {
    return pin.entityTarget;
  }

  // Nếu defaultValue là tên một Entity Target đã biết ("Resource", "Workspace", v.v.)
  const defaultValStr = typeof pin.defaultValue === "string" ? pin.defaultValue.trim() : "";
  const knownTargets = ["resource", "workspace", "contenttype", "agent", "tag", "taggroup", "variable"];
  if (knownTargets.includes(defaultValStr.toLowerCase())) {
    return defaultValStr;
  }

  const idLower = (pin.id || "").toLowerCase();
  const labelLower = (pin.label || "").toLowerCase();

  if (idLower === "entityid" || idLower === "entity" || labelLower === "entity") {
    return configValues["EntityType"] || configValues["entityType"] || "Resource";
  }

  if (pin.metadata) {
    try {
      const parsed = typeof pin.metadata === "string" ? JSON.parse(pin.metadata) : pin.metadata;
      if (parsed.type === "entity-select" && parsed.properties?.entity) {
        return parsed.properties.entity;
      }
      if (parsed.entity) return parsed.entity;
    } catch {}
  }

  if (
    idLower === "contenttype" ||
    idLower === "content_type" ||
    labelLower === "content type" ||
    idLower.includes("contenttype")
  ) {
    return "ContentType";
  }

  if (idLower.includes("resource") || labelLower.includes("resource")) {
    return "Resource";
  }
  if (idLower.includes("workspace") || labelLower.includes("workspace")) {
    return "Workspace";
  }

  return "Resource";
}

export const PIN_RULES: PinFieldRule[] = [
  // 0. Tag Tree Select (Hierarchical Tag Checkbox Tree)
  {
    predicate: (pin) => {
      if (pin.metadata) {
        try {
          const parsed = typeof pin.metadata === "string" ? JSON.parse(pin.metadata) : pin.metadata;
          if (parsed?.type === "tag-tree-select") return true;
        } catch {}
      }
      return false;
    },
    create: (pin) => ({
      name: pin.id!,
      label: pin.label || pin.id!,
      type: "pin:tagTreeSelect",
      defaultValue: Array.isArray(pin.defaultValue) ? pin.defaultValue : [],
      properties: {},
    }),
  },

  // 0.1. Select Dropdown (Static options from pin metadata)
  {
    predicate: (pin) => {
      if (pin.metadata) {
        try {
          const parsed = typeof pin.metadata === "string" ? JSON.parse(pin.metadata) : pin.metadata;
          if (parsed?.type === "select" && Array.isArray(parsed?.options)) return true;
          if (Array.isArray(parsed?.options)) return true;
        } catch {}
      }
      return false;
    },
    create: (pin) => {
      let options: string[] = [];
      try {
        const parsed = typeof pin.metadata === "string" ? JSON.parse(pin.metadata!) : pin.metadata;
        options = parsed.options || [];
      } catch {}

      return {
        name: pin.id!,
        label: pin.label || pin.id!,
        type: "select",
        defaultValue: pin.defaultValue ?? (options[0] || ""),
        properties: {
          options,
        },
      };
    },
  },

  // 1. Variable Reference pin

  {
    predicate: (pin, _, idLower) =>
      isVariablePin(pin.primitiveType, idLower, pin.entityTarget),

    create: (pin) => ({
      name: pin.id!,
      label: pin.label || pin.id!,
      type: "pin:variableSelect",
      defaultValue: pin.defaultValue ?? "",
      properties: {},
    }),
  },

  // 2. Map Cardinality → Key-Value
  {
    predicate: (pin, _, idLower) => {
      const cardStr = String(pin.cardinality ?? "").toLowerCase();
      if (cardStr === "map" || cardStr === "2") return true;
      if (idLower.includes("keyvalue") || idLower.includes("key_value")) return true;
      if (pin.metadata) {
        try {
          const parsed = typeof pin.metadata === "string" ? JSON.parse(pin.metadata) : pin.metadata;
          if (parsed?.type === "key-value" || parsed?.type === "map") return true;
        } catch {}
      }
      return false;
    },
    create: (pin) => ({
      name: pin.id!,
      label: pin.label || pin.id!,
      type: "key-value",
      defaultValue: pin.defaultValue ?? {},
      properties: {},
    }),
  },

  // 3. Array Cardinality (Text[], String[], etc.) → Tags Input (Excludes EntityRef & Object models)
  {
    predicate: (pin, normType, idLower) => {
      // Don't treat Entity References as raw string tags
      if (
        normType === "EntityRef" ||
        Boolean(pin.entityTarget) ||
        idLower === "entityid" ||
        idLower === "entity" ||
        idLower === "contenttype" ||
        idLower === "content_type" ||
        idLower.includes("contenttype")
      ) {
        return false;
      }

      if (pin.metadata) {
        try {
          const parsed = typeof pin.metadata === "string" ? JSON.parse(pin.metadata) : pin.metadata;
          if (parsed?.type === "entity-select" || parsed?.type === "tag-tree-select") return false;
        } catch {}
      }

      const cardStr = String(pin.cardinality ?? "").toLowerCase();
      const labelLower = (pin.label || "").toLowerCase();
      return (
        cardStr === "array" ||
        cardStr === "1" ||
        idLower.endsWith("[]") ||
        labelLower.endsWith("[]") ||
        idLower.includes("[]")
      );
    },
    create: (pin) => ({
      name: pin.id!,
      label: pin.label || pin.id!,
      type: "tags",
      defaultValue: Array.isArray(pin.defaultValue) ? pin.defaultValue : [],
      properties: {
        placeholder: "Type and press Enter to add tag...",
      },
    }),
  },

  // 4. EntityRef → Entity Select (Single or Multi-select)
  {
    predicate: (pin, normType, idLower) => {
      if (
        normType === "EntityRef" ||
        Boolean(pin.entityTarget) ||
        idLower === "entityid" ||
        idLower === "entity" ||
        idLower === "contenttype" ||
        idLower === "content_type" ||
        idLower.includes("contenttype")
      ) {
        return true;
      }

      if (pin.metadata) {
        try {
          const parsed = typeof pin.metadata === "string" ? JSON.parse(pin.metadata) : pin.metadata;
          if (parsed?.type === "entity-select") return true;
        } catch {}
      }

      return false;
    },
    create: (pin, _, configValues) => {
      const entityTarget = resolveEntityTargetFromPin(pin, configValues);
      const valStr = typeof pin.defaultValue === "string" ? pin.defaultValue.trim().toLowerCase() : "";
      const isPlaceholder = ["resource", "workspace", "contenttype", "agent", "tag", "taggroup", "variable", "none"].includes(valStr);
      const cleanDefault = isPlaceholder ? "" : (pin.defaultValue ?? "");

      const cardStr = String(pin.cardinality ?? "").toLowerCase();
      const idLower = (pin.id || "").toLowerCase();
      const labelLower = (pin.label || "").toLowerCase();
      let isMultiple =
        cardStr === "array" ||
        cardStr === "1" ||
        idLower.endsWith("[]") ||
        labelLower.endsWith("[]") ||
        idLower.includes("[]");

      if (pin.metadata) {
        try {
          const parsed = typeof pin.metadata === "string" ? JSON.parse(pin.metadata) : pin.metadata;
          if (parsed?.properties?.multiple === true || parsed?.multiple === true) {
            isMultiple = true;
          }
        } catch {}
      }

      return {
        name: pin.id!,
        label: pin.label || pin.id!,
        type: "pin:entitySelect",
        defaultValue: isMultiple
          ? (Array.isArray(pin.defaultValue) ? pin.defaultValue : [])
          : cleanDefault,
        properties: {
          entityTarget,
          multiple: isMultiple,
        },
      };
    },
  },

  // 5. Asset → Asset Upload
  {
    predicate: (_, normType, idLower) =>
      normType === "Asset" || idLower.includes("preset"),
    create: (pin) => ({
      name: pin.id!,
      label: pin.label || pin.id!,
      type: "pin:assetUpload",
      defaultValue: pin.defaultValue ?? "",
      properties: {
        accept: typeof pin.allowedExtensions === "string" ? pin.allowedExtensions : undefined,
      },
    }),
  },

  // 6. Boolean → Switch
  {
    predicate: (_, normType) => normType === "Boolean",
    create: (pin) => ({
      name: pin.id!,
      label: pin.label || pin.id!,
      type: "switch",
      defaultValue: Boolean(pin.defaultValue),
      properties: {},
    }),
  },

  // 7. Number → Number Input
  {
    predicate: (_, normType) => normType === "Number",
    create: (pin) => ({
      name: pin.id!,
      label: pin.label || pin.id!,
      type: "number",
      defaultValue: pin.defaultValue ?? 0,
      properties: {},
    }),
  },

  // 8. Long Text / Code
  {
    predicate: (_, __, idLower) =>
      idLower.includes("json") || idLower.includes("script") || idLower.includes("code"),
    create: (pin) => ({
      name: pin.id!,
      label: pin.label || pin.id!,
      type: "textarea",
      defaultValue: pin.defaultValue ?? "",
      properties: {
        rows: 4,
      },
    }),
  },

  // 9. Path pin
  {
    predicate: (_, normType) => normType === "Path",
    create: (pin) => ({
      name: pin.id!,
      label: pin.label || pin.id!,
      type: "pin:path",
      defaultValue: pin.defaultValue ?? "",
      properties: {},
    }),
  },
];

import type { PipelineParameterDto } from "@/gen/model";

export interface PipelineInputLike {
  key: string;
  name?: string;
  label?: string;
  type: string | number;
  cardinality?: string | number;
  isRequired?: boolean;
  defaultValue?: any;
}

/**
 * Pure function adapter biến đổi PinDefinition thành FieldDefinition chuẩn của FormRenderer
 */
export function pinToFieldDefinition(
  pin: PinDefinition,
  configValues: Record<string, any> = {},
  overrides?: { name?: string; label?: string }
): FieldDefinition<any> {
  const normType = normalizePinType(pin.primitiveType);
  const idLower = (pin.id || "").toLowerCase();

  const matchedRule = PIN_RULES.find((rule) => rule.predicate(pin, normType, idLower));
  const fieldDef = matchedRule
    ? matchedRule.create(pin, normType, configValues)
    : {
        name: pin.id!,
        label: pin.label || pin.id!,
        type: "text",
        defaultValue: pin.defaultValue ?? "",
        properties: {},
      };

  const isReq = pin.isRequired === true;
  fieldDef.properties = {
    ...fieldDef.properties,
    required: isReq,
  };

  if (overrides?.name) fieldDef.name = overrides.name;
  if (overrides?.label) fieldDef.label = overrides.label;

  return fieldDef;
}

/**
 * Adapter helper chuyển đổi PipelineParameterDto / PipelineInputLike thành FieldDefinition của FormRenderer
 */
export function pipelineInputToFieldDefinition(
  input: PipelineParameterDto | PipelineInputLike,
  configValues: Record<string, any> = {}
): FieldDefinition<any> {
  const pinDef: PinDefinition = {
    id: input.key,
    label: (input as any).label || (input as any).name || input.key,
    primitiveType: (typeof input.type === "number" ? input.type : Number(input.type) || 0) as any,
    cardinality: (input.cardinality ?? 0) as any,
    isRequired: input.isRequired,
    defaultValue: input.defaultValue,
  };
  return pinToFieldDefinition(pinDef, configValues);
}

