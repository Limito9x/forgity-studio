import { Loader2, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { UploadingItem } from "@/hooks/useFileUpload";

export interface UploadingFileCardProps {
  item: UploadingItem;
  variant?: "grid" | "list";
}

export function UploadingFileCard({
  item,
  variant = "grid",
}: UploadingFileCardProps) {
  if (variant === "list") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 p-2 text-xs opacity-80 animate-pulse">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground overflow-hidden">
            {item.previewUrl ? (
              <img
                src={item.previewUrl}
                alt={item.name}
                className="h-full w-full object-cover opacity-60"
              />
            ) : (
              <FileText className="size-4 text-muted-foreground" />
            )}
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <span className="truncate font-medium text-foreground">{item.name}</span>
            <span className="text-[0.68rem] text-primary flex items-center gap-1 font-medium">
              <Loader2 className="size-2.5 animate-spin" /> Uploading...
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Default: Grid variant
  return (
    <div className="relative flex flex-col items-center justify-center rounded-md border border-dashed border-primary/40 bg-muted/30 p-2 text-center aspect-square overflow-hidden">
      {item.previewUrl ? (
        <div className="relative size-full overflow-hidden rounded-sm bg-black/5">
          <img
            src={item.previewUrl}
            alt={item.name}
            className="h-full w-full object-cover opacity-40 blur-[1px]"
          />
        </div>
      ) : (
        <Skeleton className="size-full rounded-sm" />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/60 p-2 backdrop-blur-[1px]">
        <Loader2 className="size-5 animate-spin text-primary" />
        <span className="text-[0.65rem] font-medium text-foreground truncate max-w-full px-1">
          Uploading...
        </span>
      </div>
    </div>
  );
}
