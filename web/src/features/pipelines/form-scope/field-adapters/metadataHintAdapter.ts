import type { FieldAdapter, PinFieldContext } from "./types";

export const metadataHintAdapter: FieldAdapter = {
  id: "metadataHint",
  match: (ctx: PinFieldContext) => {
    if (!ctx.hint) return false;
    const type = ctx.hint.type?.toLowerCase();
    if (type === "tag-tree-select") return true;
    if (type === "textarea" || ctx.hint.multiline) return true;
    if (type === "tagsinput" || type === "tags") return true;
    if (type === "select" || type === "combobox" || type === "staticcombobox" || Array.isArray(ctx.hint.options))
      return true;
    if (type === "input") return true;
    return false;
  },
  create: (ctx: PinFieldContext) => {
    const rawType = ctx.hint?.type?.toLowerCase();

    // 1. Tag Tree Select
    if (rawType === "tag-tree-select") {
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "pin:tagTreeSelect",
        defaultValue: Array.isArray(ctx.pin.defaultValue)
          ? ctx.pin.defaultValue
          : [],
        properties: {},
      };
    }

    // 2. Multiline Textarea
    if (rawType === "textarea" || ctx.hint?.multiline) {
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "textarea",
        defaultValue: ctx.pin.defaultValue != null ? String(ctx.pin.defaultValue) : "",
        properties: {
          placeholder: ctx.hint?.placeholder || `Enter ${ctx.label.toLowerCase()}...`,
          rows: ctx.hint?.rows || 4,
          ...ctx.hint?.properties,
        },
      };
    }

    // 3. Tags Input (Array of strings)
    if (rawType === "tagsinput" || rawType === "tags") {
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "tagsInput",
        defaultValue: Array.isArray(ctx.pin.defaultValue)
          ? ctx.pin.defaultValue
          : typeof ctx.pin.defaultValue === "string" && ctx.pin.defaultValue
          ? [ctx.pin.defaultValue]
          : [],
        properties: {
          placeholder: ctx.hint?.placeholder || "Type and press enter...",
          ...ctx.hint?.properties,
        },
      };
    }

    // 4. Dropdown Select / Preset Mode
    if (rawType === "select" || rawType === "combobox" || Array.isArray(ctx.hint?.options)) {
      const options = ctx.hint?.options || [];
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "select",
        defaultValue: ctx.pin.defaultValue ?? (options[0] || ""),
        properties: {
          options,
          placeholder: ctx.hint?.placeholder || "Select an option...",
          allowCustom: ctx.hint?.allowCustom,
          ...ctx.hint?.properties,
        },
      };
    }

    // 5. Explicit standard Input
    return {
      name: ctx.pinId,
      label: ctx.label,
      type: "input",
      defaultValue: ctx.pin.defaultValue != null ? String(ctx.pin.defaultValue) : "",
      properties: {
        placeholder: ctx.hint?.placeholder || `Enter ${ctx.label.toLowerCase()}...`,
        ...ctx.hint?.properties,
      },
    };
  },
};
