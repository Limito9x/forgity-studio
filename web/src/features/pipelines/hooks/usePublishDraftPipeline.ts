import { useMutation, useQueryClient } from "@tanstack/react-query";
import { publishDraftPipeline, usePublishDraftPipeline } from "@/gen/endpoints/pipelines/pipelines";
import type {
  PublishDraftPipelineRequest,
  PublishDraftPipelineResponseDto,
  PublishLocalScriptItem,
} from "@/gen/model";

export type {
  PublishDraftPipelineRequest,
  PublishDraftPipelineResponseDto,
  PublishLocalScriptItem,
};

export { publishDraftPipeline, usePublishDraftPipeline };

export function usePublishDraftPipelineMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: PublishDraftPipelineRequest) => publishDraftPipeline(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline/pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline/nodes"] });
      if (variables.pipelineId) {
        queryClient.invalidateQueries({ queryKey: ["/api/pipeline/pipelines", variables.pipelineId] });
      }
    },
  });
}
