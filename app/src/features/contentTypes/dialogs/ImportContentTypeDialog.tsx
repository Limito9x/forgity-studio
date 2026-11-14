import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    useImportContentTypes,
    ContentTypeConflictStrategy,
    type ContentTypeExportItemDto,
} from "../hooks/useContentTypesExportImport";
import {
    UploadCloud,
    FileText,
    CheckCircle2,
    AlertCircle,
    X,
    Layers,
    SkipForward,
    RefreshCw,
    LayoutGrid,
    Sliders,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ImportContentTypesData {
    projectId: string;
}

interface ParsedFileState {
    fileName: string;
    fileSize: number;
    items: ContentTypeExportItemDto[];
    error?: string;
}

export function ImportContentTypeDialog({
    open,
    onOpenChange,
    data,
}: DialogProps<ImportContentTypesData>) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedFileState | null>(null);
    const [conflictStrategy, setConflictStrategy] = useState<ContentTypeConflictStrategy>(
        ContentTypeConflictStrategy.NUMBER_0
    );

    const importMutation = useImportContentTypes();
    const isPending = importMutation.isPending;

    if (!data?.projectId) return null;

    const resetFile = () => {
        setParsedData(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleFileProcess = async (file: File) => {
        if (!file.name.toLowerCase().endsWith(".json")) {
            toast.error("Please upload a .json file.");
            return;
        }

        try {
            const text = await file.text();
            const parsed = JSON.parse(text);
            let rawList: any[] = [];

            if (Array.isArray(parsed)) {
                rawList = parsed;
            } else if (parsed && Array.isArray(parsed.contentTypes)) {
                rawList = parsed.contentTypes;
            } else {
                setParsedData({
                    fileName: file.name,
                    fileSize: file.size,
                    items: [],
                    error: "JSON file does not contain a valid 'contentTypes' array.",
                });
                return;
            }

            const items: ContentTypeExportItemDto[] = rawList
                .map((t) => ({
                    key: String(t.key || t.name || "").toLowerCase().trim(),
                    name: String(t.name || t.key || "").trim(),
                    displayName: String(t.displayName || t.name || t.key || "").trim(),
                    description: t.description || null,
                    icon: t.icon || null,
                    color: t.color || null,
                    sortOrder: Number(t.sortOrder || 0),
                    displayConfig: t.displayConfig || null,
                    fieldsConfig: t.fieldsConfig || null,
                }))
                .filter((t) => Boolean(t.key));

            if (items.length === 0) {
                setParsedData({
                    fileName: file.name,
                    fileSize: file.size,
                    items: [],
                    error: "No valid Content Types found in the uploaded file.",
                });
                return;
            }

            setParsedData({
                fileName: file.name,
                fileSize: file.size,
                items,
            });
        } catch (err: any) {
            setParsedData({
                fileName: file.name,
                fileSize: file.size,
                items: [],
                error: `JSON parse error: ${err.message}`,
            });
        }
    };

    const handleDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileProcess(file);
    };

    const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileProcess(file);
    };

    const handleConfirmImport = async () => {
        if (!parsedData || parsedData.items.length === 0) return;

        try {
            await importMutation.mutateAsync({
                projectId: data.projectId,
                command: {
                    conflictStrategy,
                    contentTypes: parsedData.items,
                },
            });
            onOpenChange(false);
            resetFile();
        } catch {
            // Handled in mutation onError
        }
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <BaseDialog
            open={open}
            onOpenChange={(val) => {
                if (!isPending) {
                    onOpenChange(val);
                    if (!val) resetFile();
                }
            }}
            title="Import Content Types Schema"
            description="Upload a schema package (.content-types.json) to batch create or update content models."
            size="2xl"
            footer={
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {parsedData?.items && parsedData.items.length > 0 && (
                            <span className="flex items-center gap-1 font-medium text-foreground">
                                <CheckCircle2 className="size-3.5 text-emerald-500" />
                                {parsedData.items.length} content type(s) ready
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            isDisabled={isPending}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleConfirmImport}
                            isDisabled={
                                isPending ||
                                !parsedData ||
                                parsedData.items.length === 0 ||
                                Boolean(parsedData.error)
                            }
                            className="gap-1.5"
                        >
                            {isPending ? (
                                <RefreshCw className="size-4 animate-spin" />
                            ) : (
                                <UploadCloud className="size-4" />
                            )}
                            <span>Import Schema</span>
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-4 py-1">
                {/* 1. Upload Dropzone */}
                {!parsedData ? (
                    <div
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                        }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                            "relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer select-none",
                            isDragging
                                ? "border-primary bg-primary/5"
                                : "border-border/70 hover:border-border hover:bg-muted/30"
                        )}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
                            <UploadCloud className="size-6" />
                        </div>
                        <h4 className="text-sm font-semibold tracking-tight">
                            Choose or drag & drop schema file
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1 text-center max-w-sm">
                            Supports <span className="font-mono text-primary font-medium">.content-types.json</span> exported from Automation Studio.
                        </p>
                    </div>
                ) : (
                    /* 2. File Information Header */
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                                <FileText className="size-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-semibold truncate text-foreground">
                                    {parsedData.fileName}
                                </p>
                                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <span>{formatFileSize(parsedData.fileSize)}</span>
                                    <span>•</span>
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 uppercase font-mono">
                                        JSON
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        {!isPending && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={resetFile}
                                className="size-8 p-0 text-muted-foreground hover:text-foreground"
                            >
                                <X className="size-4" />
                            </Button>
                        )}
                    </div>
                )}

                {/* 3. Error Banner */}
                {parsedData?.error && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                        <AlertCircle className="size-4 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                            <p className="font-semibold">Unable to process schema file</p>
                            <p className="text-muted-foreground">{parsedData.error}</p>
                        </div>
                    </div>
                )}

                {/* 4. Conflict Resolution Strategy */}
                {parsedData && parsedData.items.length > 0 && (
                    <div className="space-y-2 p-3 rounded-lg border bg-card">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                <Sliders className="size-3.5 text-primary" /> Conflict Strategy
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                                If a Content Type Key already exists in this project
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() =>
                                    setConflictStrategy(ContentTypeConflictStrategy.NUMBER_0)
                                }
                                className={cn(
                                    "flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition-all select-none cursor-pointer",
                                    conflictStrategy === ContentTypeConflictStrategy.NUMBER_0
                                        ? "border-primary bg-primary/10 shadow-2xs"
                                        : "border-border/60 hover:bg-muted/40"
                                )}
                            >
                                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                    <SkipForward className="size-3.5 text-muted-foreground" />
                                    <span>Skip Existing</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                    Keep existing models untouched, only create missing types.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    setConflictStrategy(ContentTypeConflictStrategy.NUMBER_1)
                                }
                                className={cn(
                                    "flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left transition-all select-none cursor-pointer",
                                    conflictStrategy === ContentTypeConflictStrategy.NUMBER_1
                                        ? "border-primary bg-primary/10 shadow-2xs"
                                        : "border-border/60 hover:bg-muted/40"
                                )}
                            >
                                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                    <RefreshCw className="size-3.5 text-primary" />
                                    <span>Update Schema</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                    Overwrite attributes, display configs, and update form fields.
                                </p>
                            </button>
                        </div>
                    </div>
                )}

                {/* 5. Preview Table */}
                {parsedData && parsedData.items.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                                <Layers className="size-3.5 text-primary" /> Preview Content Models
                            </span>
                            <span className="text-muted-foreground text-[11px]">
                                Showing {parsedData.items.length} item(s)
                            </span>
                        </div>

                        <div className="max-h-[220px] overflow-y-auto rounded-lg border divide-y divide-border/40 bg-card text-xs">
                            {parsedData.items.map((item) => {
                                const fieldsCount = Array.isArray(item.fieldsConfig)
                                    ? item.fieldsConfig.length
                                    : 0;

                                return (
                                    <div
                                        key={item.key}
                                        className="flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div
                                                className="size-7 rounded-md flex items-center justify-center text-white shrink-0 shadow-2xs font-bold text-[10px]"
                                                style={{ backgroundColor: item.color || "#8b5cf6" }}
                                            >
                                                {item.displayName.slice(0, 1).toUpperCase()}
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold truncate text-foreground">
                                                        {item.displayName}
                                                    </span>
                                                    <span className="font-mono text-[10px] text-muted-foreground">
                                                        ({item.key})
                                                    </span>
                                                </div>
                                                {item.description && (
                                                    <p className="text-[11px] text-muted-foreground truncate max-w-[340px]">
                                                        {item.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] px-1.5 py-0 h-5 gap-1 font-mono text-muted-foreground"
                                            >
                                                <LayoutGrid className="size-3" />
                                                <span>{fieldsCount} field(s)</span>
                                            </Badge>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </BaseDialog>
    );
}
