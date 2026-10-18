import { keepPreviousData } from "@tanstack/react-query";
import * as RepositoryRunnersApi from "@/gen/endpoints/repository-runners/repository-runners";
import type { AttachedRepositoryDto } from "@/gen/model";

export type { AttachedRepositoryDto };

export const getAttachedRepositoriesByRunnerQueryKey = (runnerId?: string) =>
  runnerId
    ? RepositoryRunnersApi.getGetAttachedRepositoriesByRunnerQueryKey(runnerId)
    : (["/api/repository-runners/by-runner"] as const);

export function useAttachedRepositoriesByRunner(runnerId?: string) {
  return RepositoryRunnersApi.useGetAttachedRepositoriesByRunner<AttachedRepositoryDto[]>(
    runnerId || "",
    {
      query: {
        enabled: Boolean(runnerId),
        placeholderData: keepPreviousData,
        select: (data: any) =>
          (Array.isArray(data) ? data : data?.items || []) as AttachedRepositoryDto[],
      },
    }
  );
}
