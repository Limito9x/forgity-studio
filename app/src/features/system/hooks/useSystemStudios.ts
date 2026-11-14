import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customInstance } from "@/lib/api-client";

export interface StudioAdminSummaryDto {
  id: string;
  name: string;
  slug: string;
  planTier: number; // 0: Community, 1: IndiePro, 2: StudioTeam
  executionCreditsRemaining: number;
  studioManagedStorageQuotaBytes: number;
  studioManagedStorageUsedBytes: number;
  projectCount: number;
  createdAt: string;
}

export interface UpdateStudioQuotaPayload {
  id: string;
  planTier?: number;
  executionCreditsRemaining?: number;
  studioManagedStorageQuotaBytes?: number;
}

export function useSystemStudios() {
  return useQuery<StudioAdminSummaryDto[]>({
    queryKey: ["system-studios"],
    queryFn: () =>
      customInstance<StudioAdminSummaryDto[]>({
        url: "/api/system/studios",
        method: "GET",
      }),
  });
}

export function useUpdateStudioQuota() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateStudioQuotaPayload) =>
      customInstance({
        url: `/api/system/studios/${id}/quota`,
        method: "PATCH",
        data: { id, ...payload },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-studios"] });
    },
  });
}
