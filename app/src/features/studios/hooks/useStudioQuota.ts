import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customInstance } from "@/lib/api-client";

export interface StudioQuotaDto {
  studioId: string;
  name: string;
  slug: string;
  planTier: number; // 0: Community, 1: IndiePro, 2: StudioTeam
  executionCreditsRemaining: number;
  studioManagedStorageQuotaBytes: number;
  studioManagedStorageUsedBytes: number;
}

export interface VerifyExecutionResponse {
  studioId: string;
  allowed: boolean;
  creditsRemaining: number;
  planTier: number;
}

export function useStudioQuota(slug?: string) {
  return useQuery<StudioQuotaDto>({
    queryKey: ["studio-quota", slug],
    queryFn: async () => {
      if (!slug) throw new Error("Studio slug is required");
      return customInstance<StudioQuotaDto>({
        url: `/api/studios/${slug}/quota`,
        method: "GET",
      });
    },
    enabled: !!slug,
    staleTime: 30_000,
  });
}

export function useVerifyPipelineExecution(slug?: string) {
  return useMutation({
    mutationFn: async () => {
      if (!slug) throw new Error("Studio slug is required");
      return customInstance<VerifyExecutionResponse>({
        url: `/api/studios/${slug}/pipelines/verify-run`,
        method: "POST",
      });
    },
  });
}

export function useCompletePipelineExecution(slug?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (amount: number = 1) => {
      if (!slug) throw new Error("Studio slug is required");
      return customInstance({
        url: `/api/studios/${slug}/pipelines/complete-run`,
        method: "POST",
        data: { slug, amount },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-quota", slug] });
    },
  });
}
