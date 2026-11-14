import { useRef, useState } from "react";
import { FileCode, Loader2, X, AlertTriangle, FolderOpen, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePipelineFileUpload } from "../../hooks/usePipelineFileUpload";
import { isTauriRuntime, openNativeFileOrFolderDialog } from "@/lib/platform/filePickerStrategy";
import type { PipelineFileParameterValue, PipelineFileParameterDraft } from "../../types/file-parameter";
import type { PipelineFileAssetDto } from "../../hooks/usePipelineGraph";
import { cn } from "@/lib/utils";

interface AssetPinUploadProps {
  value?: PipelineFileParameterValue | string;
  onChange: (value: PipelineFileParameterDraft | string | null) => void;
  persistAsLink?: boolean;
  fileAsset?: PipelineFileAssetDto;
  accept?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function AssetPinUpload({
  value,
  onChange,
  fileAsset,
  persistAsLink = false,
  accept,
  placeholder = "Select or enter file path...",
  disabled = false,
}: AssetPinUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = usePipelineFileUpload();
  const [isEditingPath, setIsEditingPath] = useState(false);
  const isUploading = upload.isPending;
  const uploadError = upload.error?.message;

  // Local file string value support
  const isLocalFilePath = typeof value === "string" && (value.includes("/") || value.includes("\\") || value.startsWith("."));
  const isDraft = !isLocalFilePath && !!value && typeof value === "object" && "assetId" in value;
  const isUnbound =
    !isLocalFilePath &&
    (fileAsset?.status === "Unbound" ||
      (!!value && typeof value === "object" && "status" in value && (value as any).status === "unbound"));
  const unboundName =
    value && typeof value === "object" && "originalFileName" in value
      ? (value as any).originalFileName
      : fileAsset?.originalName;
  const fileName = isLocalFilePath
    ? (value as string).split(/[/\\]/).filter(Boolean).pop() || value
    : !value
    ? undefined
    : isDraft
    ? (value as PipelineFileParameterDraft).originalName
    : isUnbound
    ? unboundName
    : fileAsset?.originalName || (value === upload.data?.assetId ? upload.data?.originalName : undefined);
  const currentAssetLinkId =
    value && typeof value === "object"
      ? ((value as any).assetLinkId || (value as any).AssetLinkId)
      : undefined;

  const isAvailable =
    !isLocalFilePath &&
    !!value &&
    typeof value === "object" &&
    !!currentAssetLinkId &&
    fileAsset?.assetLinkId === currentAssetLinkId &&
    fileAsset?.status === "Available";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    upload.mutate({ file, onUploaded: (draft) => onChange(persistAsLink ? draft : draft.assetId) });
    e.target.value = "";
  };

  const handleBrowseLocalFile = async () => {
    if (isTauriRuntime()) {
      try {
        const extensions = accept
          ? accept.split(",").map((s) => s.trim().replace(/^\./, "")).filter(Boolean)
          : undefined;
        const selected = await openNativeFileOrFolderDialog({
          mode: "file",
          title: "Select Local File",
          extensions,
        });
        if (selected) {
          onChange(selected);
        }
      } catch (err) {
        console.warn("Failed to open native file dialog, falling back to browser picker:", err);
        fileInputRef.current?.click();
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="w-full space-y-1.5">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept || undefined}
        onChange={handleFileChange}
        disabled={disabled || isUploading}
        className="hidden"
      />

      {value || fileName ? (
        <div
          className={cn(
            "flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs",
            isUnbound
              ? "border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200"
              : isLocalFilePath
              ? "border border-emerald-500/30 bg-emerald-500/5 text-foreground"
              : "border border-primary/30 bg-primary/5"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isUnbound ? (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            ) : isLocalFilePath ? (
              <HardDrive className="h-4 w-4 text-emerald-500 shrink-0" />
            ) : (
              <FileCode className="h-4 w-4 text-primary shrink-0" />
            )}
            <div className="min-w-0">
              <span className="block font-medium text-foreground truncate" title={String(value)}>
                {fileName || "File needs to be relinked"}
              </span>
              <span
                className={cn(
                  "block text-[10px] font-mono",
                  isUnbound
                    ? "text-amber-600 dark:text-amber-400 font-medium"
                    : isLocalFilePath
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-emerald-600 dark:text-emerald-400"
                )}
              >
                {isUploading
                  ? "Uploading..."
                  : isLocalFilePath
                  ? `Local File · ${value}`
                  : isDraft
                  ? "Uploaded · waiting to save"
                  : isUnbound
                  ? "Missing file · Please re-select"
                  : !persistAsLink
                  ? "Uploaded"
                  : isAvailable
                  ? "Saved"
                  : "Upload the file again"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span title="Change file">
              <Button
                variant="ghost"
                size="icon-xs"
                onPress={handleBrowseLocalFile}
                isDisabled={disabled || isUploading}
                className="text-muted-foreground hover:text-foreground"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </Button>
            </span>
            <span title="Clear file">
              <Button
                variant="ghost"
                size="icon-xs"
                onPress={() => {
                  upload.reset();
                  onChange(null);
                }}
                isDisabled={disabled || isUploading}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </Button>
            </span>
          </div>
        </div>
      ) : isEditingPath ? (
        <div className="flex items-center gap-1.5 w-full">
          <input
            type="text"
            placeholder="e.g. D:/Assets/model.fbx or ./mesh.fbx"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val) onChange(val);
                setIsEditingPath(false);
              }
              if (e.key === "Escape") setIsEditingPath(false);
            }}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val) onChange(val);
              setIsEditingPath(false);
            }}
            autoFocus
            className="flex-1 h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono"
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onPress={() => setIsEditingPath(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 w-full">
          <button
            type="button"
            onClick={handleBrowseLocalFile}
            disabled={disabled || isUploading}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs transition-colors",
              "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground",
              isUploading && "pointer-events-none opacity-60",
              uploadError && "border-destructive/50 text-destructive"
            )}
          >
            {isUploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Uploading...</span>
              </>
            ) : (
              <>
                <FolderOpen className="h-3.5 w-3.5 text-emerald-500" />
                <span>{uploadError || placeholder}</span>
              </>
            )}
          </button>
          <span title="Type local file path directly">
            <Button
              variant="outline"
              size="sm"
              onPress={() => setIsEditingPath(true)}
              isDisabled={disabled || isUploading}
              className="h-9 px-2 text-[11px] text-muted-foreground hover:text-foreground shrink-0"
            >
              Path
            </Button>
          </span>
        </div>
      )}
      {uploadError && value && <p className="text-xs text-destructive">{uploadError}</p>}
    </div>
  );
}
