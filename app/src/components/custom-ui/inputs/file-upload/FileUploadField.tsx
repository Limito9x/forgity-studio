import type { Accept } from "react-dropzone";
import { DropZoneArea } from "./DropZoneArea";
import { CompletedFileCard } from "./CompletedFileCard";
import { UploadingFileCard } from "./UploadingFileCard";
import type { UploadAssetItem, UploadingItem } from "@/hooks/useFileUpload";
import { cn } from "@/lib/utils";

export interface FileUploadFieldProps {
  items: UploadAssetItem[];
  uploadingItems: UploadingItem[];
  isUploading: boolean;
  onFilesSelected: (files: File[]) => void;
  onRemove: (assetId: string) => void;
  variant?: "grid" | "list";
  accept?: Accept;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  className?: string;
}

export function FileUploadField({
  items,
  uploadingItems,
  isUploading,
  onFilesSelected,
  onRemove,
  variant = "grid",
  accept,
  maxFiles,
  maxSizeMB = 10,
  disabled = false,
  className,
}: FileUploadFieldProps) {
  const hasFiles = items.length > 0 || uploadingItems.length > 0;
  const isMaxReached = maxFiles ? items.length + uploadingItems.length >= maxFiles : false;

  return (
    <div className={cn("space-y-3", className)}>
      {!isMaxReached && (
        <DropZoneArea
          onDrop={onFilesSelected}
          accept={accept}
          maxFiles={maxFiles}
          maxSizeMB={maxSizeMB}
          disabled={disabled}
          isUploading={isUploading}
        />
      )}

      {hasFiles && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium px-0.5">
            <span>Uploaded Attachments ({items.length})</span>
            {maxFiles && <span>{items.length + uploadingItems.length}/{maxFiles}</span>}
          </div>

          <div
            className={cn(
              variant === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5"
                : "flex flex-col gap-1.5"
            )}
          >
            {/* 1. In-progress uploading cards */}
            {uploadingItems.map((item) => (
              <UploadingFileCard key={item.key} item={item} variant={variant} />
            ))}

            {/* 2. Completed file cards */}
            {items.map((item) => (
              <CompletedFileCard
                key={item.id}
                item={item}
                onRemove={() => onRemove(item.id)}
                variant={variant}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
