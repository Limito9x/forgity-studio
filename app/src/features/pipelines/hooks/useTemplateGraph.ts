import { useMemo } from "react";
import { useGetCloudDataPipelineVersion } from "@/gen/endpoints/cloud-data/cloud-data";
import { templateRootToPipelineGraphDto } from "../adapters/templateGraphAdapter";

export function useTemplateGraph(versionId: string | null | undefined) {
  const {
    data: versionDetail,
    isLoading,
    isError,
    error,
  } = useGetCloudDataPipelineVersion(versionId || "", {
    query: {
      enabled: Boolean(versionId),
      staleTime: Infinity,
    },
  });

  const graph = useMemo(() => {
    if (!versionDetail) return null;
    const dag = versionDetail.dagBundleJson as any;
    const rootPipeline = dag?.rootPipeline ?? dag;
    const nodes = Array.isArray(rootPipeline?.nodes) ? rootPipeline.nodes : [];
    if (nodes.length === 0) return null;

    return templateRootToPipelineGraphDto(
      versionDetail.versionId,
      versionDetail.slug,
      rootPipeline,
      versionDetail.contractsJson
    );
  }, [versionDetail]);

  return {
    versionDetail,
    graph,
    isLoading,
    isError,
    error,
  };
}
