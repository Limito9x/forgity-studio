import { useRef } from "react";
import { Upload, FileCode, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePipelineFileUpload } from "../../hooks/usePipelineFileUpload";
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
  placeholder = "Upload file (Preset / Script)",
  disabled = false,
}: AssetPinUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const upload = usePipelineFileUpload();
  const isUploading = upload.isPending;
  const uploadError = upload.error?.message;
  const isDraft = !!value && typeof value === "object" && "assetId" in value;
  const fileName = !value ? undefined : isDraft ? (value as PipelineFileParameterDraft).originalName :
    fileAsset?.originalName || (value === upload.data?.assetId ? upload.data?.originalName : undefined);
  const isAvailable = !!value && typeof value === "object" && "assetLinkId" in value &&
    fileAsset?.assetLinkId === value.assetLinkId && fileAsset.status === "Available";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    upload.mutate({ file, onUploaded: (draft) => onChange(persistAsLink ? draft : draft.assetId) });
    e.target.value = "";
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
        <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-primary/30 bg-primary/5 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <span className="block font-medium text-foreground truncate">
                {fileName || "File needs to be relinked"}
              </span>
              <span className="block text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                {isUploading ? "Uploading..." : isDraft ? "Uploaded · waiting to save" : !persistAsLink ? "Uploaded" : isAvailable ? "Saved" : "Upload the file again"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon-xs"
              onPress={() => fileInputRef.current?.click()}
              isDisabled={disabled || isUploading}
              className="text-muted-foreground hover:text-foreground"
            >
              <Upload className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onPress={() => { upload.reset(); onChange(null); }}
              isDisabled={disabled || isUploading}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isUploading}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed text-xs transition-colors",
            "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/50 text-muted-foreground hover:text-foreground",
            isUploading && "pointer-events-none opacity-60",
            uploadError && "border-destructive/50 text-destructive"
          )}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Uploading to cloud storage...</span>
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              <span>{uploadError || placeholder}</span>
            </>
          )}
        </button>
      )}
      {uploadError && value && <p className="text-xs text-destructive">{uploadError}</p>}
    </div>
  );
}
