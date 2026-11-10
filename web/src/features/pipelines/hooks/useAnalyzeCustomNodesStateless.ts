import {
  analyzeCustomNodesBatchStateless,
  useAnalyzeCustomNodesBatchStateless,
} from "@/gen/endpoints/pipeline-nodes/pipeline-nodes";
import type {
  AnalyzeCustomNodesBatchStatelessCommand,
  AnalyzeCustomNodesBatchStatelessResponseDto,
  AnalyzedStatelessNodeDto,
  StatelessScriptBatchItem,
} from "@/gen/model";

export type {
  AnalyzeCustomNodesBatchStatelessCommand,
  AnalyzeCustomNodesBatchStatelessResponseDto,
  AnalyzedStatelessNodeDto,
  StatelessScriptBatchItem,
};

export { analyzeCustomNodesBatchStateless, useAnalyzeCustomNodesBatchStateless };
export const useAnalyzeCustomNodesBatchStatelessMutation = useAnalyzeCustomNodesBatchStateless;

