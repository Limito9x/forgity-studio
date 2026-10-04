import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import type { ContentLookupDto } from "@/gen/model";
import { Folder, Plus, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContentDropTargetCardProps {
  contentItem: ContentLookupDto;
  selectedCount: number;
  onAssignClick: (contentId: string) => void;
  isPending?: boolean;
}

export function ContentDropTargetCard({
  contentItem,
  selectedCount,
  onAssignClick,
  isPending,
}: ContentDropTargetCardProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: contentItem.id,
    data: { contentItem },
  });

  const typeColor = contentItem.contentTypeColor || "#6366f1";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group relative flex flex-col justify-between p-3.5 rounded-xl border bg-card transition-all duration-200",
        "hover:border-primary/50 hover:shadow-md",
        isOver && "border-primary bg-primary/5 ring-2 ring-primary/40 scale-[1.02] shadow-lg"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="size-8 rounded-lg flex items-center justify-center shrink-0 border"
            style={{
              backgroundColor: `${typeColor}15`,
              borderColor: `${typeColor}30`,
              color: typeColor,
            }}
          >
            <Folder className="size-4" />
          </div>
          <div className="min-w-0">
            <h4 className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
              {contentItem.name}
            </h4>
            <span
              className="inline-flex items-center gap-1 text-[11px] font-medium"
              style={{ color: typeColor }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: typeColor }}
              />
              {contentItem.contentTypeName}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {isOver ? (
            <span className="font-medium text-primary flex items-center gap-1 animate-pulse">
              <ArrowRight className="size-3" /> Drop to assign
            </span>
          ) : (
            "Drop files or click"
          )}
        </span>

        <Button
          size="sm"
          variant="outline"
          isDisabled={isPending}
          onClick={() => onAssignClick(contentItem.id)}
          className={cn(
            "h-7 px-2.5 text-xs font-medium transition-colors cursor-pointer",
            selectedCount > 0 && "bg-primary/10 text-primary border-primary/30 hover:bg-primary hover:text-primary-foreground"
          )}
        >
          {selectedCount > 0 ? (
            <>
              <Check className="size-3 mr-1" />
              Assign ({selectedCount})
            </>
          ) : (
            <>
              <Plus className="size-3 mr-1" />
              Assign
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
