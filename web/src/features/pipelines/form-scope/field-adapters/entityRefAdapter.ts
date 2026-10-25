import type { FieldAdapter, PinFieldContext } from "./types";

export const entityRefAdapter: FieldAdapter = {
  id: "entityRef",
  match: (ctx: PinFieldContext) => {
    return ctx.primitive === "EntityRef" || Boolean(ctx.structType);
  },
  create: (ctx: PinFieldContext) => {
    const hintProps = (ctx.hint?.properties ?? {}) as Record<string, unknown>;
    const hintEntity = (ctx.hint?.entity || hintProps.entity) as string | undefined;
    const entityTarget = (ctx.structType || hintEntity || "").trim();

    if (!entityTarget) {
      console.warn(
        `[Pipeline Inspector] EntityRef pin '${ctx.pinId}' (${ctx.label}) has no structType or entity metadata configured.`
      );
    }

    const isMultiple =
      ctx.cardinality === "Array" ||
      ctx.hint?.multiple === true ||
      hintProps.multiple === true;

    const cleanDefault = isMultiple
      ? Array.isArray(ctx.pin.defaultValue)
        ? ctx.pin.defaultValue
        : []
      : (ctx.pin.defaultValue ?? "");

    if (entityTarget === "Runner") {
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

    if (entityTarget === "Repository") {
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

