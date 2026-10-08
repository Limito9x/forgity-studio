import { useRef, useState } from "react";
import { toast } from "sonner";
import { calculateFileHash, uploadAssetFlow } from "@/lib/upload-utils";
import { useBatchUpsertCustomNodesMutation } from "./usePipelines";
import type { AnalyzedCustomNodeDto, BatchUpsertItem } from "./usePipelines";

export interface ScriptSource {
  fileName: string;
  content: string;
  contentHash: string;
}

export function useScriptBatchPublish(projectId: string) {
  const mutation = useBatchUpsertCustomNodesMutation(projectId);
  const confirmedAssets = useRef(new Map<string, string>());
  const busy = useRef(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const publish = async (nodes: AnalyzedCustomNodeDto[], sources: Record<string, ScriptSource>, strategies: Record<string, number>) => {
    if (busy.current) return new Set<string>();
    busy.current = true;
    setIsPublishing(true);
    setErrors({});
    const failures: Record<string, string> = {};
    const published = new Set<string>();
    try {
      // Preview never creates an asset. Upload exactly the bytes analyzed, only on Publish.
      const uploads = await Promise.allSettled(nodes.map(async node => {
        const source = sources[node.key];
        if (!source || source.contentHash !== node.contentHash)
          throw new Error("Script preview is stale. Analyze the file again before publishing.");
        const file = new File([source.content], source.fileName, { type: "text/x-python" });
        if (await calculateFileHash(file) !== source.contentHash)
          throw new Error("Script content changed. Analyze the file again before publishing.");
        let assetId = confirmedAssets.current.get(source.contentHash);
        if (!assetId) {
          assetId = await uploadAssetFlow(file);
          confirmedAssets.current.set(source.contentHash, assetId);
        }
        return {
          key: node.key, name: node.suggestedName || node.key,
          label: node.suggestedLabel || node.suggestedName || null,
          executor: node.executor, contentHash: source.contentHash,
          originalFileName: source.fileName, assetId,
          inputs: node.inputs, outputs: node.outputs, strategy: strategies[node.key] ?? 0,
        } as BatchUpsertItem;
      }));
      const items: BatchUpsertItem[] = [];
      uploads.forEach((upload, index) => {
        if (upload.status === "fulfilled") items.push(upload.value);
        else failures[nodes[index].key] = upload.reason instanceof Error ? upload.reason.message : "Script upload failed. Please retry.";
      });
      if (items.length > 0) {
        try {
          const response = await mutation.mutateAsync({ data: { projectId, items } });
          response.results.forEach(item => published.add(item.key));
          response.errors.forEach(error => { failures[error.key] = error.message; });
        } catch {
          items.forEach(item => { failures[item.key] = "Publish failed. Please retry this script."; });
        }
      }
      setErrors(failures);
      if (published.size > 0) toast.success(`Published ${published.size} script(s).`);
      if (Object.keys(failures).length > 0) toast.error(`${Object.keys(failures).length} script(s) failed. Review the errors and retry.`);
      return published;
    } finally {
      busy.current = false;
      setIsPublishing(false);
    }
  };

  const reset = () => { if (!busy.current) { confirmedAssets.current.clear(); setErrors({}); } };
  return { publish, isPublishing, errors, reset };
}
