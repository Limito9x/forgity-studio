import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    exportContentTypes,
    importContentTypes,
    getGetContentTypesQueryKey,
} from "@/gen/endpoints/content-types/content-types";
import type {
    ContentTypeExportPackageDto,
    ContentTypeExportItemDto,
    ImportContentTypesCommand,
    ImportContentTypesResult,
    ContentTypeImportError,
} from "@/gen/model";
import { ContentTypeConflictStrategy } from "@/gen/model";

export type {
    ContentTypeExportPackageDto,
    ContentTypeExportItemDto,
    ImportContentTypesCommand,
    ImportContentTypesResult,
    ContentTypeImportError,
};
export { ContentTypeConflictStrategy };

export function downloadContentTypesFile(
    data: ContentTypeExportPackageDto,
    customFileName?: string
) {
    const timestamp = new Date().toISOString().split("T")[0];
    const defaultBase = `content-types-${timestamp}`;

    const content = JSON.stringify(data, null, 2);
    const mimeType = "application/json";
    const fileName = customFileName
        ? customFileName.endsWith(".json")
            ? customFileName
            : `${customFileName}.content-types.json`
        : `${defaultBase}.content-types.json`;

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function useExportContentTypes() {
    return useMutation({
        mutationFn: async ({
            projectId,
            keys,
            ids,
            customFileName,
        }: {
            projectId: string;
            keys?: string;
            ids?: string;
            customFileName?: string;
        }) => {
            const data = await exportContentTypes(projectId, { keys, ids });
            return { data, customFileName };
        },
        onSuccess: ({ data, customFileName }) => {
            if (!data?.contentTypes || data.contentTypes.length === 0) {
                toast.info("No content types found to export.");
                return;
            }
            downloadContentTypesFile(data, customFileName);
            toast.success(`Successfully exported ${data.totalTypes} content type(s).`);
        },
        onError: (err: any) => {
            toast.error(
                err?.response?.data?.message || err?.message || "Failed to export content types."
            );
        },
    });
}

export function useImportContentTypes() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            projectId,
            command,
        }: {
            projectId: string;
            command: ImportContentTypesCommand;
        }) => {
            return await importContentTypes(projectId, command);
        },
        onSuccess: (result: ImportContentTypesResult, { projectId }) => {
            // Invalidate content types list
            queryClient.invalidateQueries({
                queryKey: getGetContentTypesQueryKey(projectId),
            });

            const { createdCount, updatedCount, skippedCount, errors } = result;

            if (errors && errors.length > 0) {
                toast.warning(
                    `Import completed with ${errors.length} issue(s). Created: ${createdCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}.`
                );
            } else {
                toast.success(
                    `Successfully imported schema! Created: ${createdCount}, Updated: ${updatedCount}, Skipped: ${skippedCount}.`
                );
            }
        },
        onError: (err: any) => {
            toast.error(
                err?.response?.data?.message || err?.message || "Failed to import content types."
            );
        },
    });
}
