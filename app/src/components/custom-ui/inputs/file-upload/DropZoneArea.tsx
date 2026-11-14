import { useDropzone, type Accept } from "react-dropzone";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropZoneAreaProps {
  onDrop: (acceptedFiles: File[]) => void;
  accept?: Accept;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  isUploading?: boolean;
  className?: string;
}

export function DropZoneArea({
  onDrop,
  accept,
  maxFiles,
  maxSizeMB = 10,
  disabled = false,
  isUploading = false,
  className,
}: DropZoneAreaProps) {
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept,
    maxFiles,
    maxSize: maxSizeMB * 1024 * 1024,
    disabled: disabled || isUploading,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-all cursor-pointer outline-none select-none",
        "bg-muted/20 border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40",
        isDragActive && "border-primary bg-primary/5 scale-[0.99]",
        isDragReject && "border-destructive bg-destructive/5",
        (disabled || isUploading) && "opacity-50 pointer-events-none cursor-not-allowed",
        className
      )}
    >
      <input {...getInputProps()} />

      <div className="p-3 bg-background rounded-full shadow-xs mb-2 border border-border">
        <UploadCloud className="h-5 w-5 text-muted-foreground" />
      </div>

      <p className="text-xs font-medium text-foreground">
        {isDragActive
          ? isDragReject
            ? "Some files will be rejected"
            : "Drop files here..."
          : "Drag & drop files here, or click to browse"}
      </p>

      <p className="text-[0.68rem] text-muted-foreground mt-1">
        Maximum file size: {maxSizeMB}MB
        {maxFiles ? ` • Up to ${maxFiles} file(s)` : ""}
      </p>
    </div>
  );
}
