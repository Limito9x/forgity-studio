export const ContentDisplayModes = {
  TABLE: "table",
  LIST_CARD: "list-card",
} as const;

export type ContentDisplayMode = typeof ContentDisplayModes[keyof typeof ContentDisplayModes];
