import { customInstance } from "@/lib/api-client";
import { useMutation } from "@tanstack/react-query";

export interface StatelessScriptBatchItem {
  key: string;
  fileName: string;
  fullPath: string;
  scriptContent: string;
  contentHash: string;
}

export interface AnalyzeCustomNodesBatchStatelessCommand {
  projectId: string;
  scripts: StatelessScriptBatchItem[];
}

export interface AnalyzedStatelessNodeDto {
  key: string;
  fileName: string;
  fullPath: string;
  suggestedName: string;
  suggestedLabel: string;
  executor: string;
  description?: string;
  contentHash: string;
  inputs: any[];
  outputs: any[];
  dependencies?: { module: string; packageName: string }[];
}

export interface AnalyzeCustomNodesBatchStatelessResponseDto {
  nodes: AnalyzedStatelessNodeDto[];
}

export async function analyzeCustomNodesBatchStateless(
  command: AnalyzeCustomNodesBatchStatelessCommand
): Promise<AnalyzeCustomNodesBatchStatelessResponseDto> {
  return await customInstance<AnalyzeCustomNodesBatchStatelessResponseDto>({
    url: "/api/pipeline/nodes/custom/analyze-batch-stateless",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    data: command,
  });
}

export function useAnalyzeCustomNodesBatchStatelessMutation() {
  return useMutation({
    mutationFn: (command: AnalyzeCustomNodesBatchStatelessCommand) =>
      analyzeCustomNodesBatchStateless(command),
  });
}
