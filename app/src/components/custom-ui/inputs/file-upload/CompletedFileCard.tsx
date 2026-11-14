import { FileText, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip";
import type { UploadAssetItem } from "@/hooks/useFileUpload";
import { cn } from "@/lib/utils";

export interface CompletedFileCardProps {
  item: UploadAssetItem;
  onRemove: () => void;
  variant?: "grid" | "list";
  disabled?: boolean;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function CompletedFileCard({
  item,
  onRemove,
  variant = "grid",
  disabled = false,
}: CompletedFileCardProps) {
  const isImage = item.contentType?.startsWith("image/") || !!item.publicUrl;

  if (variant === "list") {
    return (
      <TooltipTrigger delay={200}>
        <div className="group relative flex items-center justify-between gap-3 rounded-md border border-border bg-card p-2 text-xs shadow-xs transition-colors hover:border-muted-foreground/40">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground overflow-hidden">
              {isImage ? (
                <img
                  src={item.publicUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <FileText className="size-4 text-primary" />
              )}
            </div>

            <div className="flex flex-col min-w-0 flex-1">
              <span className="truncate font-medium text-foreground">{item.name}</span>
              {item.size ? (
                <span className="text-[0.68rem] text-muted-foreground">
                  {formatBytes(item.size)}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {item.publicUrl && (
              <a
                href={item.publicUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                title="View file"
              >
                <ExternalLink className="size-3.5" />
              </a>
            )}

            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                onPress={onRemove}
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
        <Tooltip placement="top">{item.name}</Tooltip>
      </TooltipTrigger>
    );
  }

  // Default: Grid variant
  return (
    <TooltipTrigger delay={200}>
      <div className="group relative flex flex-col items-center justify-center rounded-md border border-border bg-card p-2 text-center shadow-xs transition-all hover:border-primary/50 aspect-square overflow-hidden">
        {isImage ? (
          <div className="relative size-full overflow-hidden rounded-sm bg-black/5">
            <img
              src={item.publicUrl}
              alt={item.name}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1 p-2">
            <FileText className="size-6 text-primary mb-1" />
            <span className="truncate w-full text-[0.7rem] font-medium text-foreground px-1">
              {item.name}
            </span>
            {item.size ? (
              <span className="text-[0.625rem] text-muted-foreground">
                {formatBytes(item.size)}
              </span>
            ) : null}
          </div>
        )}

        {/* Hover overlay with action buttons */}
        <div className={cn(
          "absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1",
          isImage ? "rounded-md" : "rounded-md"
        )}>
          {item.publicUrl && (
            <a
              href={item.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex size-6 items-center justify-center rounded-full bg-background/80 text-foreground hover:bg-background transition-colors"
              title="Open full preview"
            >
              <ExternalLink className="size-3" />
            </a>
          )}

          {!disabled && (
            <Button
              type="button"
              variant="destructive"
              size="icon-xs"
              className="size-6 rounded-full"
              onPress={onRemove}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      </div>
      <Tooltip placement="top">{item.name}</Tooltip>
    </TooltipTrigger>
  );
}
