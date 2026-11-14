import { useQueryClient } from "@tanstack/react-query";
import * as RunnersApi from "@/gen/endpoints/runners/runners";
import type { UpdateRunnerEnvRequest } from "@/gen/model";

export type RunnerEnvMap = Record<string, string>;

export const useRunnerEnv = (runnerId?: string, isOnline: boolean = true) => {
  return RunnersApi.useGetRunnerEnv<RunnerEnvMap>(runnerId || "", {
    query: {
      enabled: !!runnerId && isOnline,
      staleTime: 10_000,
      retry: 1,
    },
  });
};

export const useUpdateRunnerEnv = (runnerId?: string) => {
  const queryClient = useQueryClient();
  const mutation = RunnersApi.useUpdateRunnerEnv();

  const updateEnv = async (data: UpdateRunnerEnvRequest) => {
    if (!runnerId) throw new Error("Runner ID is required to update environment variables");

    const result = await mutation.mutateAsync({
      runnerId,
      data,
    });

    // Invalidate query to refresh env list
    queryClient.invalidateQueries({
      queryKey: RunnersApi.getGetRunnerEnvQueryKey(runnerId),
    });

    return result;
  };

  return {
    ...mutation,
    updateEnv,
  };
};
