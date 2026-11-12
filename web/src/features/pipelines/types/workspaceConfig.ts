export interface WorkspaceRootConfig {
  version: number;
  scriptsDir: string;
  pipelinesDir: string;
  ignorePatterns?: string[];
}

export interface WorkspaceInitResult {
  rootPath: string;
  config: WorkspaceRootConfig;
  localPaletteJson?: string | null;
  localStructsJson?: string | null;
}

export type LocalStructFieldType = "String" | "Number" | "Boolean" | "Asset" | "Struct";

export interface LocalStructField {
  name: string;
  label: string;
  type: LocalStructFieldType;
  cardinality: "Single" | "Array";
  structType?: string;
  defaultValue?: any;
  description?: string;
}

export interface LocalStructDefinition {
  slug: string;
  displayName: string;
  description?: string;
  fields: LocalStructField[];
  updatedAt?: string;
}

export interface LocalDraftNode {
  key: string;
  fileName: string;
  fullPath: string;
  folderRoot: string;
  namespace?: string;
  suggestedName: string;
  suggestedLabel: string;
  executor: string;
  description?: string;
  contentHash: string;
  sourceCode?: string;
  inputs: any[];
  outputs: any[];
  detectedStructs?: LocalStructDefinition[];
  dependencies?: { module: string; packageName: string }[];
  lastSyncedAt: string;
}

export type ScriptSyncStatus = 'unchanged' | 'new' | 'modified';

export interface StagedScriptItem extends LocalDraftNode {
  status: ScriptSyncStatus;
}

export interface ScannedScriptItemRust {
  namespace: string;
  key: string;
  fileName: string;
  relativePath: string;
  fullPath: string;
  folderRoot: string;
  content: string;
  contentHash: string;
  lastModifiedMs: number;
}

export interface ScannedPipelineYamlItemRust {
  fileName: string;
  relativePath: string;
  fullPath: string;
  content: string;
  lastModifiedMs: number;
  pipelineKind?: "component" | "master";
  executor?: string;
}

export interface ScriptScanSummary {
  unchanged: number;
  newCount: number;
  modified: number;
  total: number;
  lastScannedAt: string;
}
