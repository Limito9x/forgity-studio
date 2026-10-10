import { useDroppable } from "@dnd-kit/core";
import { Tag as TagIcon, X } from "lucide-react";
import type { TagDropZonePayload, TagLinkDetailDto } from "../types";
import { useDeleteTagLink } from "../hooks/useTags";
import { useProjectToolbarStore } from "@/stores/projectToolbarStore";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TagDroppableCellProps {
    path: string;
    value: any;
    entityId?: string;
    entityType?: string;
    existingTags?: TagLinkDetailDto[];
    renderValueContent?: (value: any) => React.ReactNode;
}

export function TagDroppableCell({
    path,
    value,
    entityId,
    entityType = "Resource",
    existingTags = [],
    renderValueContent,
}: TagDroppableCellProps) {
    const isDroppableEnabled = Boolean(entityId);
    const deleteTagLink = useDeleteTagLink();
    const isDraggingGlobal = useProjectToolbarStore((s) => s.isDragging);

    const payload: TagDropZonePayload = {
        type: "tag-drop-zone",
        path,
        entityId: entityId || "",
        entityType,
    };

    const { setNodeRef, isOver } = useDroppable({
        id: `drop-${entityId}-${path}`,
        data: payload,
        disabled: !isDroppableEnabled,
    });

    return (
        <div
            ref={setNodeRef}
            data-path={path}
            className={cn(
                "group/cell relative flex flex-wrap items-center justify-between gap-1.5 p-1 px-1.5 rounded-md transition-all min-h-[28px] w-full",
                isDroppableEnabled && "border border-border/30 hover:border-primary/40 bg-card/30",
                isDraggingGlobal && isDroppableEnabled && "border-dashed border-primary/50 bg-primary/5 shadow-2xs",
                isOver && "ring-2 ring-primary border-primary bg-primary/25 scale-[1.01] shadow-md z-10"
            )}
        >
            {/* The actual value */}
            <div className="flex items-center">
                {renderValueContent ? renderValueContent(value) : String(value)}
            </div>

            {/* Existing tags on this path with delete 'x' button */}
            {existingTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1 ml-1">
                    {existingTags.map((tag) => {
                        const tagColor = tag.tagColor || "#3b82f6";
                        return (
                            <span
                                key={tag.tagLinkId}
                                className="group/tag inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded text-[10px] font-medium border shadow-2xs select-none transition-all"
                                style={{
                                    backgroundColor: `${tagColor}15`,
                                    color: tagColor,
                                    borderColor: `${tagColor}30`,
                                }}
                                title={tag.tagPath || tag.tagName}
                            >
                                <TagIcon className="w-2.5 h-2.5" />
                                <span>{tag.tagName}</span>
                                <button
                                    type="button"
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
                                    className="opacity-60 hover:opacity-100 hover:bg-black/20 dark:hover:bg-white/20 rounded p-0.5 transition-opacity cursor-pointer"
                                    title="Remove tag"
                                    aria-label="Remove tag"
                                >
                                    <X className="w-2.5 h-2.5" />
                                </button>
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
