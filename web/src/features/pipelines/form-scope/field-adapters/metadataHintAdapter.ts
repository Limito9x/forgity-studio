import type { FieldAdapter, PinFieldContext } from "./types";

export const metadataHintAdapter: FieldAdapter = {
  id: "metadataHint",
  match: (ctx: PinFieldContext) => {
    if (!ctx.hint) return false;
    if (ctx.hint.type === "tag-tree-select") return true;
    if (ctx.hint.type === "select" || Array.isArray(ctx.hint.options))
      return true;
    return false;
  },
  create: (ctx: PinFieldContext) => {
    if (ctx.hint?.type === "tag-tree-select") {
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

    const options = ctx.hint?.options || [];
    return {
      name: ctx.pinId,
      label: ctx.label,
      type: "select",
      defaultValue: ctx.pin.defaultValue ?? (options[0] || ""),
      properties: {
        options,
      },
    };
  },
};
