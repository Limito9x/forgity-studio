import { useQueryClient } from "@tanstack/react-query";
import * as RunnersApi from "@/gen/endpoints/runners/runners";
import type { RunnerDccSessionDto } from "@/gen/model";

export type { RunnerDccSessionDto };

export const useRunnerDccSessions = (runnerId?: string, isOnline: boolean = true) => {
  return RunnersApi.useGetRunnerDccSessions(runnerId || "", {
    query: {
      enabled: !!runnerId && isOnline,
      refetchInterval: 15_000,
      staleTime: 5_000,
      retry: 1,
    },
  });
};

export const useStopRunnerDccSession = (runnerId?: string) => {
  const queryClient = useQueryClient();
  const mutation = RunnersApi.useStopRunnerDccSession();

  const stopSession = async ({ key, all = false }: { key?: string; all?: boolean }) => {
    if (!runnerId) throw new Error("Runner ID is required to stop DCC resident session");

    const result = await mutation.mutateAsync({
      runnerId,
      data: {
        key,
        all,
      },
    });

    queryClient.invalidateQueries({
      queryKey: RunnersApi.getGetRunnerDccSessionsQueryKey(runnerId),
    });

    return result;
  };

  return {
    ...mutation,
    stopSession,
  };
};

