import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useImportContentItemsMutation } from "../hooks/useContentItemsExportImport";
import { ContentItemConflictStrategy } from "@/gen/model";
import {
    UploadCloud,
    FileText,
    CheckCircle2,
    AlertCircle,
    X,
    Layers,
    SkipForward,
    RefreshCw,
    PlusCircle,
    Download,
    KeyIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ImportContentItemsDialogData {
    projectId: string;
    contentTypeKey: string;
    contentTypeName?: string;
    fieldsConfig?: Array<{ key: string; name?: string; type?: string }>;
}

export interface ContentItemRowPreview {
    name: string;
    key?: string;
    values?: Record<string, any>;
}

interface ParsedFileState {
    fileName: string;
    fileSize: number;
    format: "json" | "csv";
    items: ContentItemRowPreview[];
    error?: string;
}

/**
 * Utility to split CSV line considering quoted values
 */
function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++; // skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === "," && !inQuotes) {
            values.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

export function ImportContentItemDialog({
    open,
    onOpenChange,
    data,
}: DialogProps<ImportContentItemsDialogData>) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [parsedData, setParsedData] = useState<ParsedFileState | null>(null);
    const [conflictStrategy, setConflictStrategy] = useState<ContentItemConflictStrategy>(
        ContentItemConflictStrategy.NUMBER_0
    );

    const importMutation = useImportContentItemsMutation(
        data?.projectId || "",
        data?.contentTypeKey || ""
    );
    const isPending = importMutation.isPending;

    if (!data?.projectId || !data?.contentTypeKey) return null;

    const resetFile = () => {
        setParsedData(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDownloadTemplate = () => {
        const headers = ["name", "key"];
        if (Array.isArray(data.fieldsConfig)) {
            data.fieldsConfig.forEach((f) => {
                if (f.key && !headers.includes(f.key)) {
                    headers.push(f.key);
                }
            });
        }
        const sampleRow = [`Sample ${data.contentTypeName || "Item"} 1`, "sample-item-1"];
        if (headers.length > 2) {
            for (let i = 2; i < headers.length; i++) {
                sampleRow.push("sample_value");
            }
        }

        const csvContent = `${headers.join(",")}\n${sampleRow.join(",")}\n`;
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.contentTypeKey}_template.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.info("CSV template downloaded.");
    };

    const processJsonFile = (text: string, file: File) => {
        try {
            const parsed = JSON.parse(text);
            let rawList: any[] = [];

            if (Array.isArray(parsed)) {
                rawList = parsed;
            } else if (parsed && Array.isArray(parsed.items)) {
                rawList = parsed.items;
            } else {
                setParsedData({
                    fileName: file.name,
                    fileSize: file.size,
                    format: "json",
                    items: [],
                    error: "JSON file must contain an array or an object with an 'items' array.",
                });
                return;
            }

            const items: ContentItemRowPreview[] = rawList
                .map((row) => {
                    const name = String(row.name || row.title || "").trim();
                    const key = row.key ? String(row.key).trim() : undefined;
                    let values: Record<string, any> = {};

                    if (row.values && typeof row.values === "object") {
                        values = { ...row.values };
                    } else {
                        // Extract any other properties not name/key/id/created/updated
                        const { id, key: _k, name: _n, createdAt, updatedAt, projectId, contentTypeId, ...rest } = row;
                        values = rest;
                    }

                    return { name, key, values };
                })
                .filter((r) => Boolean(r.name));

            if (items.length === 0) {
                setParsedData({
                    fileName: file.name,
                    fileSize: file.size,
                    format: "json",
                    items: [],
                    error: "No valid items found in JSON (each item must have at least a 'name').",
                });
                return;
            }

            setParsedData({
                fileName: file.name,
                fileSize: file.size,
                format: "json",
                items,
            });
        } catch (err: any) {
            setParsedData({
                fileName: file.name,
                fileSize: file.size,
                format: "json",
                items: [],
                error: `JSON parse error: ${err.message}`,
            });
        }
    };

    const processCsvFile = (text: string, file: File) => {
        try {
            const lines = text
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l.length > 0);

            if (lines.length < 2) {
                setParsedData({
                    fileName: file.name,
                    fileSize: file.size,
                    format: "csv",
                    items: [],
                    error: "CSV file must contain a header row and at least one data row.",
                });
                return;
            }

            const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
            const nameIdx = headers.findIndex((h) => h === "name" || h === "title");
            const keyIdx = headers.findIndex((h) => h === "key" || h === "slug" || h === "itemkey");

            const items: ContentItemRowPreview[] = [];

            for (let i = 1; i < lines.length; i++) {
                const cols = parseCsvLine(lines[i]);
                if (cols.every((c) => !c)) continue; // skip blank line

                const name = nameIdx >= 0 ? cols[nameIdx] : cols[0] || "";
                const key = keyIdx >= 0 && cols[keyIdx] ? cols[keyIdx] : undefined;

                const values: Record<string, any> = {};
                headers.forEach((h, idx) => {
                    if (idx !== nameIdx && idx !== keyIdx && idx < cols.length) {
                        let cell = cols[idx];
                        // Auto parse primitive types if applicable
                        if (cell === "true") values[h] = true;
                        else if (cell === "false") values[h] = false;
                        else if (cell !== "" && !isNaN(Number(cell))) values[h] = Number(cell);
                        else values[h] = cell;
                    }
                });

                if (name.trim()) {
                    items.push({ name: name.trim(), key: key ? key.trim() : undefined, values });
                }
            }

            if (items.length === 0) {
                setParsedData({
                    fileName: file.name,
                    fileSize: file.size,
                    format: "csv",
                    items: [],
                    error: "No valid rows found in CSV. Please ensure a 'name' column exists.",
                });
                return;
            }

            setParsedData({
                fileName: file.name,
                fileSize: file.size,
                format: "csv",
                items,
            });
        } catch (err: any) {
            setParsedData({
                fileName: file.name,
                fileSize: file.size,
                format: "csv",
                items: [],
                error: `CSV parse error: ${err.message}`,
            });
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

        const text = await file.text();
        if (isJson) {
            processJsonFile(text, file);
        } else {
            processCsvFile(text, file);
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
                contentTypeKey: data.contentTypeKey,
                conflictStrategy,
                items: parsedData.items,
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
            title={`Import ${data.contentTypeName || "Content"} Items`}
            description={`Upload a batch file (.json or .csv) to import items into "${data.contentTypeKey}".`}
            size="2xl"
            footer={
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {parsedData?.items && parsedData.items.length > 0 && (
                            <span className="flex items-center gap-1 font-medium text-foreground">
                                <CheckCircle2 className="size-3.5 text-emerald-500" />
                                {parsedData.items.length} item(s) ready
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
                            <span>Import Items</span>
                        </Button>
                    </div>
                </div>
            }
        >
            <div className="space-y-4 py-1">
                {/* 1. Header with Template Download */}
                <div className="flex items-center justify-between text-xs pb-1 border-b">
                    <span className="text-muted-foreground">
                        Supported formats: <strong className="text-foreground">JSON</strong> or <strong className="text-foreground">CSV</strong>
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDownloadTemplate}
                        className="h-7 text-xs gap-1.5 text-primary hover:text-primary/80"
                    >
                        <Download className="size-3.5" />
                        <span>Download CSV Template</span>
                    </Button>
                </div>

                {/* 2. Upload Dropzone */}
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
                            accept=".json,.csv"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
                            <UploadCloud className="size-6" />
                        </div>
                        <h4 className="text-sm font-semibold tracking-tight">
                            Choose or drag & drop items file
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1 text-center max-w-sm">
                            Supports <span className="font-mono text-primary font-medium">.json</span> or <span className="font-mono text-primary font-medium">.csv</span> with name, key and dynamic field columns.
                        </p>
                    </div>
                ) : (
                    /* 3. File Information Header */
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
                                        {parsedData.format}
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

                {/* 4. Error Banner */}
                {parsedData?.error && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                        <AlertCircle className="size-4 shrink-0 mt-0.5" />
                        <div className="space-y-0.5">
                            <p className="font-semibold">Unable to process file</p>
                            <p className="text-muted-foreground">{parsedData.error}</p>
                        </div>
                    </div>
                )}

                {/* 5. Conflict Resolution Strategy */}
                {parsedData && parsedData.items.length > 0 && (
                    <div className="space-y-2 p-3 rounded-lg border bg-card">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                Conflict Strategy
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                                If an item Key/Slug already exists in this Content Type
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() =>
                                    setConflictStrategy(ContentItemConflictStrategy.NUMBER_0)
                                }
                                className={cn(
                                    "flex flex-col items-start gap-1 p-2 rounded-lg border text-left transition-all select-none cursor-pointer",
                                    conflictStrategy === ContentItemConflictStrategy.NUMBER_0
                                        ? "border-primary bg-primary/10 shadow-2xs"
                                        : "border-border/60 hover:bg-muted/40"
                                )}
                            >
                                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                    <SkipForward className="size-3.5 text-muted-foreground" />
                                    <span>Skip Existing</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                    Keep existing items untouched.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    setConflictStrategy(ContentItemConflictStrategy.NUMBER_1)
                                }
                                className={cn(
                                    "flex flex-col items-start gap-1 p-2 rounded-lg border text-left transition-all select-none cursor-pointer",
                                    conflictStrategy === ContentItemConflictStrategy.NUMBER_1
                                        ? "border-primary bg-primary/10 shadow-2xs"
                                        : "border-border/60 hover:bg-muted/40"
                                )}
                            >
                                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                    <RefreshCw className="size-3.5 text-primary" />
                                    <span>Update Existing</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                    Overwrite values & name.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() =>
                                    setConflictStrategy(ContentItemConflictStrategy.NUMBER_2)
                                }
                                className={cn(
                                    "flex flex-col items-start gap-1 p-2 rounded-lg border text-left transition-all select-none cursor-pointer",
                                    conflictStrategy === ContentItemConflictStrategy.NUMBER_2
                                        ? "border-primary bg-primary/10 shadow-2xs"
                                        : "border-border/60 hover:bg-muted/40"
                                )}
                            >
                                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                    <PlusCircle className="size-3.5 text-emerald-500" />
                                    <span>Create New</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                    Append suffix (e.g. -1, -2).
                                </p>
                            </button>
                        </div>
                    </div>
                )}

                {/* 6. Preview Table */}
                {parsedData && parsedData.items.length > 0 && (
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                                <Layers className="size-3.5 text-primary" /> Preview Sample Items
                            </span>
                            <span className="text-muted-foreground text-[11px]">
                                Showing first {Math.min(parsedData.items.length, 5)} of {parsedData.items.length} item(s)
                            </span>
                        </div>

                        <div className="max-h-[200px] overflow-y-auto rounded-lg border divide-y divide-border/40 bg-card text-xs">
                            {parsedData.items.slice(0, 5).map((item, idx) => {
                                const valuesKeys = item.values ? Object.keys(item.values) : [];

                                return (
                                    <div
                                        key={idx}
                                        className="flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors"
                                    >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="size-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 font-mono text-[10px]">
                                                {idx + 1}
                                            </div>

                                            <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-semibold truncate text-foreground">
                                                        {item.name}
                                                    </span>
                                                    {item.key && (
                                                        <span className="font-mono text-[10px] text-muted-foreground flex items-center gap-0.5">
                                                            <KeyIcon className="size-2.5" />
                                                            {item.key}
                                                        </span>
                                                    )}
                                                </div>
                                                {valuesKeys.length > 0 && (
                                                    <p className="text-[11px] text-muted-foreground truncate max-w-[360px]">
                                                        Fields: {valuesKeys.join(", ")}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] px-1.5 py-0 h-5 font-mono text-muted-foreground"
                                            >
                                                {valuesKeys.length} field(s)
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
