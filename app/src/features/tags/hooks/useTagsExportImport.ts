import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    exportTags,
    importTags,
    getGetTagsQueryKey,
    getGetTagTreeQueryKey,
} from "@/gen/endpoints/tags/tags";
import type {
    TagExportPackageDto,
    TagExportItemDto,
    ImportTagsCommand,
    ImportTagsResult,
    TagImportError,
} from "@/gen/model";
import { TagConflictStrategy } from "@/gen/model";

export type {
    TagExportPackageDto,
    TagExportItemDto,
    ImportTagsCommand,
    ImportTagsResult,
    TagImportError,
};
export { TagConflictStrategy };

export interface ClientTagImportItem {
    path: string;
    name?: string | null;
    color?: string | null;
    description?: string | null;
}

function escapeCsvField(val?: string | null): string {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function downloadTagsFile(
    data: TagExportPackageDto,
    format: "json" | "csv",
    customFileName?: string
) {
    const timestamp = new Date().toISOString().split("T")[0];
    const defaultBase = `gameplay-tags-${timestamp}`;

    let content: string;
    let mimeType: string;
    let fileName: string;

    if (format === "json") {
        content = JSON.stringify(data, null, 2);
        mimeType = "application/json";
        fileName = customFileName
            ? customFileName.endsWith(".json")
                ? customFileName
                : `${customFileName}.tags.json`
            : `${defaultBase}.tags.json`;
    } else {
        const lines: string[] = ["Path,Name,Color,Description"];
        for (const tag of data.tags) {
            lines.push(
                [
                    escapeCsvField(tag.path),
                    escapeCsvField(tag.name),
                    escapeCsvField(tag.color),
                    escapeCsvField(tag.description),
                ].join(",")
            );
        }
        content = lines.join("\r\n");
        mimeType = "text/csv;charset=utf-8;";
        fileName = customFileName
            ? customFileName.endsWith(".csv")
                ? customFileName
                : `${customFileName}.tags.csv`
            : `${defaultBase}.tags.csv`;
    }

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

export function useExportTags() {
    return useMutation({
        mutationFn: async ({
            projectId,
            format,
            customFileName,
        }: {
            projectId: string;
            format: "json" | "csv";
            customFileName?: string;
        }) => {
            const data = await exportTags({ projectId });
            downloadTagsFile(data, format, customFileName);
            return data;
        },
        onSuccess: (data, variables) => {
            toast.success(
                `Exported ${data.totalTags} tag(s) successfully as .${variables.format}!`
            );
        },
        onError: () => {
            toast.error("Failed to export tags. Please try again.");
        },
    });
}

export function useImportTagsMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (command: ImportTagsCommand) => {
            return await importTags(command);
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: getGetTagsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetTagTreeQueryKey() });
            queryClient.invalidateQueries({ queryKey: ["/api/tags"] });

            if (res.errors && res.errors.length > 0) {
                toast.warning(
                    `Imported ${res.createdCount} new, ${res.updatedCount} updated, with ${res.errors.length} issue(s).`
                );
            } else {
                toast.success(
                    `Import completed: ${res.createdCount} new, ${res.updatedCount} updated, ${res.skippedCount} skipped.`
                );
            }
        },
        onError: (err: any) => {
            const msg =
                err?.response?.data?.message ??
                err?.response?.data?.title ??
                "Failed to import tags.";
            toast.error(msg);
        },
    });
}
