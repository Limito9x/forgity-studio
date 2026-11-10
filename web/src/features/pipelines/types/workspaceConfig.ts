export interface ScriptFolderConfig {
  namespace: string;
  path: string;
  enabled: boolean;
}

export interface ForgityWorkspaceConfig {
  $schema?: string;
  projectId: string;
  primaryPipelineFolder: string;
  scriptFolders: ScriptFolderConfig[];
}

export interface LocalDraftNode {
  key: string;
  fileName: string;
  fullPath: string;
  folderRoot: string;
  namespace: string;
  suggestedName: string;
  suggestedLabel: string;
  executor: string;
  description?: string;
  contentHash: string;
  inputs: any[];
  outputs: any[];
  dependencies?: { module: string; packageName: string }[];
  lastSyncedAt: string;
}

export type ScriptSyncStatus = 'unchanged' | 'new' | 'modified';

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

export interface ScriptScanSummary {
  unchanged: number;
  newCount: number;
  modified: number;
  total: number;
  lastScannedAt: string;
}
