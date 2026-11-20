import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";

export interface LocalDccSessionInfo {
  key: string;
  executor: string;
  project_path?: string | null;
  pid: number;
  state: "starting" | "idle" | "busy";
  started_at_secs: number;
  remaining_seconds: number;
  keep_alive_minutes: number;
}

const QUERY_KEY = ["local-dcc-sessions"] as const;

export function useLocalDccSessions(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const isTauri = isTauriRuntime();

  useEffect(() => {
    if (!enabled || !isTauri) return;
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ type: string; sessions?: LocalDccSessionInfo[] }>(
        "local-pipeline://dcc-sessions",
        (ev) => {
          if (Array.isArray(ev.payload?.sessions)) {
            queryClient.setQueryData(QUERY_KEY, ev.payload.sessions);
          }
        },
      ).then((fn) => {
        unlisten = fn;
      });
    });

    return () => {
      unlisten?.();
    };
  }, [enabled, isTauri, queryClient]);

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<LocalDccSessionInfo[]> => {
      if (!isTauri) return [];
      return await invoke<LocalDccSessionInfo[]>("list_local_dcc_sessions");
    },
    enabled: enabled && isTauri,
    refetchInterval: (q) => {
      const data = q.state.data;
      return Array.isArray(data) && data.length > 0 ? 5_000 : 15_000;
    },
    staleTime: 2_000,
  });

  const stopMutation = useMutation({
    mutationFn: async (params: { key?: string; all?: boolean }) => {
      if (!isTauri) return;
      await invoke("stop_local_dcc_session", {
        key: params.key ?? null,
        all: params.all ?? false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  return {
    sessions: query.data ?? [],
    stopSession: stopMutation.mutateAsync,
    isStopping: stopMutation.isPending,
  };
}
