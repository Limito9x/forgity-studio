import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { uploadAssetFlow } from "@/lib/upload-utils";
import type { PipelineFileParameterDraft } from "../types/file-parameter";

export function usePipelineFileUpload() {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  return useMutation({
    mutationFn: async ({ file }: { file: File; onUploaded: (value: PipelineFileParameterDraft) => void }) => ({
      assetId: await uploadAssetFlow(file),
      originalName: file.name,
    }),
    onSuccess: (draft, { onUploaded }) => {
      if (mounted.current) onUploaded(draft);
    },
  });
}
