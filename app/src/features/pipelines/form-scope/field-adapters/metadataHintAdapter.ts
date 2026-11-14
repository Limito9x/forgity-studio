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
    const isArray = ctx.cardinality === "Array" || ctx.hint?.multiple === true;
    const options = ctx.hint?.options || [];
    const hasOptions = Array.isArray(options) && options.length > 0;
    const allowCustom = ctx.hint?.allowCustom ?? true;

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

    // 3. Array / Multi-Select / Tags Input
    // If it's an array (like Maps: Text[]), or explicitly tagsinput, OR has options with isArray:
    if (isArray || rawType === "tagsinput" || rawType === "tags") {
      let defaultVal: string[] = [];
      if (Array.isArray(ctx.pin.defaultValue)) {
        defaultVal = ctx.pin.defaultValue.map(String);
      } else if (ctx.pin.defaultValue != null && ctx.pin.defaultValue !== "") {
        defaultVal = [String(ctx.pin.defaultValue)];
      }

      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "tagsInput",
        defaultValue: defaultVal,
        properties: {
          placeholder: ctx.hint?.placeholder || (hasOptions ? "Select presets or type..." : "Type and press enter..."),
          options: hasOptions ? options : undefined,
          allowCustom: allowCustom,
          ...ctx.hint?.properties,
        },
      };
    }

    // 4. Dropdown / Preset for Single Value
    if (hasOptions || rawType === "select" || rawType === "combobox") {
      // If user disabled custom values (strict predefined list), use Select
      if (!allowCustom && rawType !== "combobox") {
        return {
          name: ctx.pinId,
          label: ctx.label,
          type: "select",
          defaultValue: ctx.pin.defaultValue ?? (options[0] || ""),
          properties: {
            options,
            placeholder: ctx.hint?.placeholder || "Select an option...",
            ...ctx.hint?.properties,
          },
        };
      }

      // If allowCustom is true (default for free text preset), use Combobox!
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "combobox",
        defaultValue: ctx.pin.defaultValue ?? (options[0] || ""),
        properties: {
          options,
          allowCustom: true,
          placeholder: ctx.hint?.placeholder || "Select or enter custom value...",
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
