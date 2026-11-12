import type { FieldAdapter, PinFieldContext } from "./types";

export const assetAdapter: FieldAdapter = {
  id: "asset",
  match: (ctx: PinFieldContext) => {
    if (ctx.primitive === "Asset") return true;

    const hintType = ctx.hint?.type?.toLowerCase();
    return hintType === "file" || hintType === "asset";
  },
  create: (ctx: PinFieldContext) => {
    const hintAccept = (ctx.hint as any)?.accept || (ctx.hint?.properties as any)?.accept;
    const accept =
      typeof ctx.pin.allowedExtensions === "string" && ctx.pin.allowedExtensions.trim()
        ? ctx.pin.allowedExtensions
        : typeof hintAccept === "string" && hintAccept.trim()
          ? hintAccept
          : ctx.pinId.toLowerCase().includes("preset")
            ? ".py"
            : undefined;

    return {
      name: ctx.pinId,
      label: ctx.label,
      type: "pin:assetUpload",
      defaultValue: ctx.pin.defaultValue ?? "",
      properties: {
        accept,
      },
    };
  },
};
