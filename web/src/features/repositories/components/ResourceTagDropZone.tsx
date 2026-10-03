import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Tag as TagIcon, X, Plus } from "lucide-react";
import { useTagLinks, useDeleteTagLink } from "@/features/tags/hooks/useTags";
import type { TagDropZonePayload, TagLinkDetailDto } from "@/features/tags/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ResourceTagDropZoneProps {
  resourceId: string;
  projectId: string;
  className?: string;
}

export function ResourceTagDropZone({
  resourceId,
  projectId: _projectId,
  className,
}: ResourceTagDropZoneProps) {
  const { data: tagLinks = [] } = useTagLinks({
    entityType: "Resource",
    entityId: resourceId,
  });
  const deleteTagLink = useDeleteTagLink();

  const payload: TagDropZonePayload = {
    type: "tag-drop-zone",
    path: "",
    entityId: resourceId,
    entityType: "Resource",
  };

  const { setNodeRef, isOver } = useDroppable({
    id: `drop-resource-${resourceId}`,
    data: payload,
  });

  const tags = useMemo(() => {
    return ((tagLinks as unknown as TagLinkDetailDto[]) || []).filter(
      (tag) => !tag.targetSubPath || tag.targetSubPath.trim() === ""
    );
  }, [tagLinks]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "inline-flex items-center flex-wrap gap-1.5 px-2 py-0.5 rounded-lg border border-dashed transition-all duration-200 min-h-[28px]",
        isOver
          ? "ring-2 ring-primary border-primary bg-primary/10 shadow-sm"
          : "border-border/50 hover:border-border/80 bg-muted/20 hover:bg-muted/40",
        className
      )}
    >
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground mr-0.5 select-none">
        <TagIcon className="size-3 text-muted-foreground/70" />
      </div>

      {tags.length > 0 ? (
        tags.map((tag) => {
          const tagColor = tag.tagColor || "#3b82f6";
          return (
            <span
              key={tag.tagLinkId}
              className="group inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[11px] font-medium border shadow-2xs select-none transition-all"
              style={{
                backgroundColor: `${tagColor}15`,
                color: tagColor,
                borderColor: `${tagColor}35`,
              }}
              title={tag.tagPath || tag.tagName}
            >
              <span>{tag.tagName}</span>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  deleteTagLink.mutate(
                    { id: tag.tagLinkId },
                    {
                      onSuccess: () => toast.success("Tag removed"),
                      onError: (err: any) =>
                        toast.error(err?.message || "Failed to remove tag"),
                    }
                  );
                }}
                className="size-3.5 p-0 opacity-60 hover:opacity-100 hover:bg-black/20 dark:hover:bg-white/20 rounded transition-opacity cursor-pointer"
                aria-label="Remove tag"
              >
                <X className="size-2.5" />
              </Button>
            </span>
          );
        })
      ) : (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60 italic select-none">
          <Plus className="size-2.5" />
          <span>Drop tag here</span>
        </span>
      )}
    </div>
  );
}
