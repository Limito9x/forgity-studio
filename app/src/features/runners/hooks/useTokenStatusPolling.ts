import { useQuery } from "@tanstack/react-query";
import { customInstance } from "@/lib/api-client";

export interface RunnerTokenStatusDto {
  status: "pending" | "connected" | "expired";
  runnerId?: string;
  runnerName?: string;
  machineKey?: string;
  connectedAt?: string;
}

/**
 * Polling hook that queries the pairing status of a setup token every 2 seconds.
 * Automatically stops polling when token status is 'connected' or 'expired'.
 */
export function useTokenStatusPolling(
  token: string | null | undefined,
  enabled: boolean = true
) {
  return useQuery<RunnerTokenStatusDto>({
    queryKey: ["runner-token-status", token],
    queryFn: async () => {
      if (!token) {
        return { status: "expired" };
      }
      return await customInstance<RunnerTokenStatusDto>({
        url: `/api/runners/tokens/${encodeURIComponent(token)}/status`,
        method: "GET",
      });
    },
    enabled: Boolean(token && enabled),
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.status;
      if (currentStatus === "connected" || currentStatus === "expired") {
        return false;
      }
      return 2000; // Poll every 2 seconds during pending
    },
    refetchIntervalInBackground: false,
  });
}
