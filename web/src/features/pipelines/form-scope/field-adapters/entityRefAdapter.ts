import type { FieldAdapter, PinFieldContext } from "./types";

export const entityRefAdapter: FieldAdapter = {
  id: "entityRef",
  match: (ctx: PinFieldContext) => {
    return ctx.primitive === "EntityRef" || Boolean(ctx.structType);
  },
  create: (ctx: PinFieldContext) => {
    const isMultiple =
      ctx.cardinality === "Array" || ctx.hint?.multiple === true;
    const cleanDefault = isMultiple
      ? Array.isArray(ctx.pin.defaultValue)
        ? ctx.pin.defaultValue
        : []
      : (ctx.pin.defaultValue ?? "");

    if (ctx.structType === "Runner") {
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "pin:runnerSelect",
        defaultValue: cleanDefault,
        properties: {
          placeholder: "Select runner...",
          multiple: isMultiple,
        },
      };
    }

    if (ctx.structType === "Repository") {
      return {
        name: ctx.pinId,
        label: ctx.label,
        type: "pin:repositorySelect",
        defaultValue: cleanDefault,
        properties: {
          placeholder: "Select repository...",
          multiple: isMultiple,
        },
      };
    }

    const entityTarget = ctx.structType || ctx.hint?.entity || "Resource";
    return {
      name: ctx.pinId,
      label: ctx.label,
      type: "pin:entitySelect",
      defaultValue: cleanDefault,
      properties: {
        entityTarget,
        multiple: isMultiple,
      },
    };
  },
};
