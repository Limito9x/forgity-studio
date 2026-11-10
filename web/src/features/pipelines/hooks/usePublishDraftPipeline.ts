import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customInstance } from "@/lib/api-client";
import type { SavePipelineNodeItem, SavePipelineEdgeItem, PipelineParameter } from "@/gen/model";

export interface PublishLocalScriptItem {
  key: string;
  name: string;
  label?: string;
  executor?: string;
  content: string;
  sourceOrigin?: string;
}

export interface PublishDraftPipelineRequest {
  projectId: string;
  pipelineId?: string;
  name: string;
  description?: string;
  nodes: SavePipelineNodeItem[];
  edges: SavePipelineEdgeItem[];
  parameters?: PipelineParameter[];
  localScripts?: PublishLocalScriptItem[];
}

export interface PublishDraftPipelineResponseDto {
  pipelineId: string;
  name: string;
  versionNumber: number;
  publishedScriptCount: number;
  message: string;
}

export function usePublishDraftPipelineMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PublishDraftPipelineRequest): Promise<PublishDraftPipelineResponseDto> => {
      const response = await customInstance<PublishDraftPipelineResponseDto>({
        url: "/api/pipeline/pipelines/publish-draft",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data,
      });
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline/pipelines"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pipeline/nodes"] });
      if (variables.pipelineId) {
        queryClient.invalidateQueries({ queryKey: ["/api/pipeline/pipelines", variables.pipelineId] });
      }
    },
  });
}
