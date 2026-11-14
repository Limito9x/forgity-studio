import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    useImportTagsMutation,
    TagConflictStrategy,
    type ClientTagImportItem,
} from "../hooks/useTagsExportImport";
import {
    UploadCloud,
    FileText,
    CheckCircle2,
    AlertCircle,
    X,
    RefreshCw,
    SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ImportTagsData {
    projectId: string;
}

interface ParsedFileState {
    fileName: string;
    fileSize: number;
    format: "json" | "csv";
    items: ClientTagImportItem[];
    rawCsv?: string;
    error?: string;
}

export function ImportTagsDialog({
    open,
    onOpenChange,
    data,
}: DialogProps<ImportTagsData>) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedFileState | null>(null);
    const [conflictStrategy, setConflictStrategy] = useState<TagConflictStrategy>(
        TagConflictStrategy.NUMBER_0
    );

    const importMutation = useImportTagsMutation();
    const isPending = importMutation.isPending;

    if (!data?.projectId) return null;

    const resetFile = () => {
        setParsedData(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleFileProcess = async (file: File) => {
        const lowerName = file.name.toLowerCase();
        const isJson = lowerName.endsWith(".json");
        const isCsv = lowerName.endsWith(".csv");

        if (!isJson && !isCsv) {
            toast.error("Please upload a .json or .csv file.");
            return;
        }

        try {
            const text = await file.text();
            if (isJson) {
                const parsed = JSON.parse(text);
                let rawList: any[] = [];
                if (Array.isArray(parsed)) {
                    rawList = parsed;
                } else if (parsed && Array.isArray(parsed.tags)) {
                    rawList = parsed.tags;
                } else {
                    setParsedData({
                        fileName: file.name,
                        fileSize: file.size,
                        format: "json",
                        items: [],
                        error: "JSON file does not contain a valid 'tags' array.",
                    });
                    return;
                }

                const items: ClientTagImportItem[] = rawList
                    .map((t) => ({
                        path: typeof t === "string" ? t : (t.path || t.name || ""),
                        name: t.name || null,
                        color: t.color || null,
                        description: t.description || null,
                    }))
                    .filter((t) => Boolean(t.path));

                if (items.length === 0) {
                    setParsedData({
                        fileName: file.name,
                        fileSize: file.size,
                        format: "json",
                        items: [],
                        error: "No valid tag paths found in JSON file.",
                    });
                    return;
                }

                setParsedData({
                    fileName: file.name,
                    fileSize: file.size,
                    format: "json",
                    items,
                });
            } else {
                // CSV parsing preview
                const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
                if (lines.length === 0) {
                    setParsedData({
                        fileName: file.name,
                        fileSize: file.size,
                        format: "csv",
                        items: [],
                        error: "CSV file is empty.",
                    });
                    return;
                }

                // Quick client preview
                setParsedData({
                    fileName: file.name,
                    fileSize: file.size,
                    format: "csv",
                    items: [], // Will be parsed by backend or items preview
                    rawCsv: text,
                });
            }
        } catch (err: any) {
            setParsedData({
                fileName: file.name,
                fileSize: file.size,
                format: isJson ? "json" : "csv",
                items: [],
                error: `Failed to read file: ${err.message || "Unknown error"}`,
            });
        }
    };

    const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            void handleFileProcess(file);
        }
    };

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            void handleFileProcess(file);
        }
    };

    const handleImport = () => {
        if (!parsedData || parsedData.error) return;

        if (parsedData.format === "csv" && parsedData.rawCsv) {
            importMutation.mutate(
                {
                    projectId: data.projectId,
                    conflictStrategy,
                    csvContent: parsedData.rawCsv,
                },
                {
                    onSuccess: () => {
                        onOpenChange(false);
                        resetFile();
                    },
                }
            );
        } else if (parsedData.items.length > 0) {
            importMutation.mutate(
                {
                    projectId: data.projectId,
                    conflictStrategy,
                    tags: parsedData.items,
                },
                {
                    onSuccess: () => {
                        onOpenChange(false);
                        resetFile();
                    },
                }
            );
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        return `${(bytes / 1024).toFixed(1)} KB`;
    };

    return (
        <BaseDialog
            open={open}
            onOpenChange={(isOpen) => {
                if (!isPending) {
                    onOpenChange(isOpen);
                    if (!isOpen) resetFile();
                }
            }}
            title="Import GameplayTags"
            description="Import tags from a .tags.json or .tags.csv (Unreal Engine format) file."
            size="lg"
            footer={
                <div className="flex items-center justify-between w-full">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        isDisabled={isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleImport}
                        isDisabled={!parsedData || Boolean(parsedData.error) || isPending}
                        className="gap-2"
                    >
                        {isPending ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Importing...
                            </>
                        ) : (
                            <>
                                <UploadCloud className="w-4 h-4" />
                                Import Tags
                            </>
                        )}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4 py-2">
                {/* File Upload Zone */}
                {!parsedData ? (
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                            "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors",
                            isDragging
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/50 hover:bg-muted/30"
                        )}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,.csv"
                            onChange={handleFileInputChange}
                            className="hidden"
                        />
                        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                            <UploadCloud className="w-6 h-6" />
                        </div>
                        <p className="text-sm font-semibold text-foreground">
                            Click to upload or drag & drop file
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                            Supports .tags.json, .json, .tags.csv (Unreal Engine format)
                        </p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-border p-4 bg-muted/20 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                                    <FileText className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-foreground">
                                        {parsedData.fileName}
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span>{formatBytes(parsedData.fileSize)}</span>
                                        <span>•</span>
                                        <Badge variant="outline" className="text-[10px] uppercase py-0 px-1.5">
                                            {parsedData.format}
                                        </Badge>
                                        {parsedData.items.length > 0 && (
                                            <>
                                                <span>•</span>
                                                <span className="text-primary font-medium">
                                                    {parsedData.items.length} tag(s) detected
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={resetFile}
                                isDisabled={isPending}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>

                        {parsedData.error ? (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{parsedData.error}</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                <span>File parsed successfully and ready for import.</span>
                            </div>
                        )}

                        {/* Preview list for JSON */}
                        {parsedData.items.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Preview (first {Math.min(parsedData.items.length, 5)} tags):
                                </span>
                                <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                                    {parsedData.items.slice(0, 5).map((item, idx) => (
                                        <div
                                            key={idx}
                                            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-background/60 border border-border/50 text-xs"
                                        >
                                            <div
                                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                                style={{ backgroundColor: item.color || "#3b82f6" }}
                                            />
                                            <span className="font-mono text-foreground truncate flex-1">
                                                {item.path}
                                            </span>
                                            {item.name && item.name !== item.path && (
                                                <span className="text-muted-foreground text-[10px]">
                                                    ({item.name})
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    {parsedData.items.length > 5 && (
                                        <p className="text-[10px] text-muted-foreground text-center pt-0.5">
                                            + {parsedData.items.length - 5} more tag(s)...
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Conflict Resolution Strategy */}
                <div className="space-y-2 pt-1">
                    <label className="text-xs font-semibold text-foreground">
                        Conflict Strategy
                    </label>
                    <p className="text-[11px] text-muted-foreground">
                        How should the system handle tags that already exist in this project?
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                            type="button"
                            onClick={() => setConflictStrategy(TagConflictStrategy.NUMBER_0)}
                            className={cn(
                                "flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer",
                                conflictStrategy === TagConflictStrategy.NUMBER_0
                                    ? "border-primary bg-primary/5 text-foreground shadow-xs"
                                    : "border-border hover:border-border/80 text-muted-foreground hover:bg-muted/30"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <SkipForward className="w-4 h-4 text-primary" />
                                <span className="text-xs font-semibold text-foreground">
                                    Skip Existing
                                </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground leading-snug">
                                Keep existing tags untouched. Only insert new paths.
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setConflictStrategy(TagConflictStrategy.NUMBER_1)}
                            className={cn(
                                "flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer",
                                conflictStrategy === TagConflictStrategy.NUMBER_1
                                    ? "border-primary bg-primary/5 text-foreground shadow-xs"
                                    : "border-border hover:border-border/80 text-muted-foreground hover:bg-muted/30"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <RefreshCw className="w-4 h-4 text-primary" />
                                <span className="text-xs font-semibold text-foreground">
                                    Update Existing
                                </span>
                            </div>
                            <span className="text-[11px] text-muted-foreground leading-snug">
                                Overwrite existing tags with incoming colors & descriptions.
                            </span>
                        </button>
                    </div>
                </div>
            </div>
        </BaseDialog>
    );
}
