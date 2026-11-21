import { useMutation } from "@tanstack/react-query";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";

export interface ManifestPipelineItem {
  slug: string;
  kind: "master" | "component" | string;
  relativePath: string;
  graphSource: string;
  graphHash: string;
  dependsOn: string[];
  scriptKeys: string[];
}

export interface ManifestScriptItem {
  key: string;
  executor: string;
  contentHash: string;
  sourceCode: string;
  requirements: string[];
  usedBy: string[];
}

export interface ManifestConstantItem {
  key: string;
  dataType: string;
  scope: string;
  valueJson: string;
  usedBy: string[];
}

export interface ManifestAssetItem {
  name: string;
  relativePath: string;
  sizeBytes: number;
  hash: string;
  nodeId: string;
  inputKey: string;
}

export interface ManifestDiagnostic {
  level: "error" | "warning" | "info" | string;
  code: string;
  message: string;
  pipelineSlug?: string | null;
}

export interface ManifestTotals {
  masterCount: number;
  componentCount: number;
  scriptCount: number;
  constantCount: number;
  assetCount: number;
  assetBytes: number;
  errorCount: number;
  warningCount: number;
}

export interface TemplateDependencyManifest {
  rootPath: string;
  generatedAt: string;
  persisted: boolean;
  pipelines: ManifestPipelineItem[];
  scripts: ManifestScriptItem[];
  constants: ManifestConstantItem[];
  assets: ManifestAssetItem[];
  diagnostics: ManifestDiagnostic[];
  totals: ManifestTotals;
}

export function useTemplateDependencyScan() {
  return useMutation({
    mutationFn: async (params: {
      rootPath: string;
      rootPipelinePaths: string[];
      persist?: boolean;
    }): Promise<TemplateDependencyManifest> => {
      if (!isTauriRuntime()) {
        throw new Error("Dependency scanner requires Forgity Studio Desktop (Tauri Runtime).");
      }
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<TemplateDependencyManifest>("scan_template_dependencies", {
        rootPath: params.rootPath,
        rootPipelinePaths: params.rootPipelinePaths,
        persist: params.persist ?? true,
      });
    },
  });
}
