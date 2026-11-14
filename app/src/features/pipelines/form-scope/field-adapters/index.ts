import { metadataHintAdapter } from "./metadataHintAdapter.ts";
import { variableRefAdapter } from "./variableRefAdapter.ts";
import { collectionAdapter } from "./collectionAdapter.ts";
import { assetAdapter } from "./assetAdapter.ts";
import { primitiveAdapter } from "./primitiveAdapter.ts";
import type { FieldAdapter } from "./types.ts";

export * from "./types.ts";
export * from "./buildPinFieldContext.ts";
export * from "./metadataHintAdapter.ts";
export * from "./variableRefAdapter.ts";
export * from "./collectionAdapter.ts";
export * from "./assetAdapter.ts";
export * from "./primitiveAdapter.ts";

export const FIELD_ADAPTERS: readonly FieldAdapter[] = [
  metadataHintAdapter,
  variableRefAdapter,
  collectionAdapter,
  assetAdapter,
  primitiveAdapter, // Fallback catch-all
];
