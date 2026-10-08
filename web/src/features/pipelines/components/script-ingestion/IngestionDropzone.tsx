import { useDropzone } from "react-dropzone";
import { UploadCloud, Loader2, FileCode, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExecutorIcon } from "@/features/runners/components/ExecutorIcon";

interface IngestionDropzoneProps {
  onFilesDropped: (files: File[]) => void;
  isAnalyzing: boolean;
  onOpenGuidelines?: () => void;
}

export function IngestionDropzone({
  onFilesDropped,
  isAnalyzing,
  onOpenGuidelines,
}: IngestionDropzoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onFilesDropped,
    accept: { "text/x-python": [".py"] },
    multiple: true,
  });

  return (
    <div className="flex flex-col items-center justify-center min-h-[500px] h-[calc(100vh-220px)] w-full max-w-4xl mx-auto p-6">
      <div
        {...getRootProps()}
        className={cn(
          "w-full border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-6",
          isDragActive
            ? "border-primary bg-primary/5 scale-[1.01] shadow-lg shadow-primary/10"
            : "border-border hover:border-primary/50 hover:bg-muted/30 hover:shadow-md"
        )}
      >
        <input {...getInputProps()} />

        <div className="p-5 rounded-2xl bg-primary/10 text-primary shadow-inner">
          {isAnalyzing ? (
            <Loader2 className="size-10 animate-spin" />
          ) : (
            <UploadCloud className="size-10" />
          )}
        </div>

        <div className="space-y-2 max-w-md">
          <h3 className="text-xl font-semibold tracking-tight">
            {isAnalyzing
              ? "Scanning AST & Analyzing Scripts..."
              : "Drag & Drop Python Scripts"}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Drop your Python scripts here to automatically parse docstrings, inspect
            input/output pin definitions, detect overrides, and analyze dependency graphs.
          </p>
        </div>

        <div className="flex items-center gap-6 text-xs text-muted-foreground pt-4 border-t border-border/50">
          <span className="flex items-center gap-1.5 font-medium">
            <ExecutorIcon executor="blender" className="size-4" /> Blender Runner
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <ExecutorIcon executor="unreal" className="size-4" /> Unreal Engine
          </span>
          <span className="flex items-center gap-1.5 font-medium">
            <ExecutorIcon executor="python" className="size-4" /> Python Worker
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium">
            <FileCode className="size-3.5" />
            Supports batch upload of multiple <code className="font-mono font-semibold">.py</code> files
          </div>

          {onOpenGuidelines && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenGuidelines();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 transition-colors border border-primary/20 hover:border-primary/40 cursor-pointer"
            >
              <BookOpen className="size-3.5" />
              Script Guidelines & Code Templates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
