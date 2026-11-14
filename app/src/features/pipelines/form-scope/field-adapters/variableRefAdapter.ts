import type { FieldAdapter, PinFieldContext } from "./types";

export const variableRefAdapter: FieldAdapter = {
  id: "variableRef",
  match: (ctx: PinFieldContext) => {
    return ctx.structType === "Variable";
  },
  create: (ctx: PinFieldContext) => ({
    name: ctx.pinId,
    label: ctx.label,
    type: "pin:variableSelect",
    defaultValue: ctx.pin.defaultValue ?? "",
    properties: {},
  }),
};
