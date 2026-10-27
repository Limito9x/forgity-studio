import { useQuery } from "@tanstack/react-query";
import { customInstance } from "@/lib/api-client";

export interface CustomNodeSourceDto {
  id: string;
  key: string;
  name: string;
  fileName?: string | null;
  content: string;
  contentHash?: string | null;
  executor: string;
}

export function useCustomNodeSource(nodeDefinitionId?: string, enabled = false) {
  return useQuery({
    queryKey: ["custom-nodes", nodeDefinitionId, "source"],
    queryFn: async () => {
      if (!nodeDefinitionId) throw new Error("Missing nodeDefinitionId");
      return await customInstance<CustomNodeSourceDto>({
        url: `/api/pipeline/nodes/custom/${nodeDefinitionId}/source`,
        method: "GET",
      });
    },
    enabled: Boolean(nodeDefinitionId) && enabled,
    staleTime: 60_000,
  });
}

