import type { FieldAdapter, PinFieldContext } from "./types";

export const primitiveAdapter: FieldAdapter = {
  id: "primitive",
  match: () => true, // Fallback catch-all for primitives
  create: (ctx: PinFieldContext) => {
    if (ctx.primitive === "Boolean") {
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "switch",
        defaultValue: Boolean(ctx.pin.defaultValue),
        properties: {},
      };
    }

    if (ctx.primitive === "Number") {
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "number",
        defaultValue: ctx.pin.defaultValue ?? 0,
        properties: {},
      };
    }

    if (ctx.primitive === "Path") {
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "pin:path",
        defaultValue: ctx.pin.defaultValue ?? "",
        properties: {},
      };
    }

    if (ctx.hint?.multiline === true || ctx.hint?.type === "textarea") {
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "textarea",
        defaultValue: ctx.pin.defaultValue ?? "",
        properties: {
          rows: ctx.hint?.rows ?? 4,
        },
      };
    }

    return {
      name: ctx.pinId,
      label: ctx.label,
      type: "text",
      defaultValue: ctx.pin.defaultValue ?? "",
      properties: {},
    };
  },
};
