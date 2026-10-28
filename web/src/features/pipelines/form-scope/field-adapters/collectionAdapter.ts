import type { FieldAdapter, PinFieldContext } from "./types";

export const collectionAdapter: FieldAdapter = {
  id: "collection",
  match: (ctx: PinFieldContext) => {
    if (ctx.primitive === "EntityRef" || Boolean(ctx.structType)) {
      return false;
    }
    return ctx.cardinality === "Map" || ctx.cardinality === "Array";
  },
  create: (ctx: PinFieldContext) => {
    if (ctx.cardinality === "Map") {
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "key-value",
        defaultValue: ctx.pin.defaultValue ?? {},
        properties: {},
      };
    }

    return {
      name: ctx.pinId,
      label: ctx.label,
      type: "tags",
      defaultValue: Array.isArray(ctx.pin.defaultValue)
        ? ctx.pin.defaultValue
        : [],
      properties: {
        placeholder: "Type and press Enter to add tag...",
      },
    };
  },
};
