import type { FieldAdapter, PinFieldContext } from "./types";

export const assetAdapter: FieldAdapter = {
  id: "asset",
  match: (ctx: PinFieldContext) => {
    return ctx.primitive === "Asset";
  },
  create: (ctx: PinFieldContext) => ({
    name: ctx.pinId,
    label: ctx.label,
    type: "pin:assetUpload",
    defaultValue: ctx.pin.defaultValue ?? "",
    properties: {
      accept:
        typeof ctx.pin.allowedExtensions === "string"
          ? ctx.pin.allowedExtensions
          : undefined,
    },
  }),
};
