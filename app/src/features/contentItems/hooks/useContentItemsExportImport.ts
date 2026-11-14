import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  exportContentItems,
  useImportContentItems as useGeneratedImportContentItems,
  getGetContentItemsQueryKey,
} from "@/gen/endpoints/content-items/content-items";
import type { ImportContentItemsCommand } from "@/gen/model";
import { toast } from "sonner";

export interface ExportContentItemsOptions {
  projectId: string;
  contentTypeKey: string;
  format?: "json" | "csv";
  ids?: string;
  keys?: string;
}

export function useExportContentItems() {
  return useMutation({
    mutationFn: async ({
      projectId,
      contentTypeKey,
      format = "json",
      ids,
      keys,
    }: ExportContentItemsOptions) => {
      const result = await exportContentItems(projectId, contentTypeKey, {
        format,
        ids,
        keys,
        contentTypeKey,
      });
      return { result, format, contentTypeKey };
    },
    onSuccess: ({ result, format, contentTypeKey }) => {
      if (format === "csv" && result.csvContent) {
        const blob = new Blob([result.csvContent], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${contentTypeKey}_items_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Exported ${result.totalItems} items to CSV.`);
      } else {
        const jsonStr = JSON.stringify(result, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${contentTypeKey}_items_${new Date().toISOString().slice(0, 10)}.items.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success(`Exported ${result.totalItems} items to JSON.`);
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to export content items.");
    },
  });
}

export function useImportContentItemsMutation(
  projectId: string,
  contentTypeKey: string,
) {
  const queryClient = useQueryClient();
  const mutation = useGeneratedImportContentItems();

  return useMutation({
    mutationFn: async (command: ImportContentItemsCommand) => {
      return await mutation.mutateAsync({
        projectId,
        key: contentTypeKey,
        data: command,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({
        queryKey: getGetContentItemsQueryKey(projectId, contentTypeKey),
      });
      queryClient.invalidateQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === "string" &&
          query.queryKey[0].includes("/contents"),
      });

      if (res.errors && res.errors.length > 0) {
        toast.warning(
          `Import completed with ${res.errors.length} warnings. Created: ${res.createdCount}, Updated: ${res.updatedCount}, Skipped: ${res.skippedCount}.`,
        );
      } else {
        toast.success(
          `Imported successfully! Created: ${res.createdCount}, Updated: ${res.updatedCount}, Skipped: ${res.skippedCount}.`,
        );
      }
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to import content items.");
    },
  });
}
