import { useDraggable } from "@dnd-kit/core";
import { GripVertical, Tag as TagIcon } from "lucide-react";
import type { DraggableTagPayload } from "../types";
import { cn } from "@/lib/utils";

interface DraggableTagCardProps {
    tag: {
        id?: string;
        path: string;
        name: string;
        color?: string | null;
        description?: string | null;
    };
    isOverlay?: boolean;
}

export function DraggableTagCard({
    tag,
    isOverlay = false,
}: DraggableTagCardProps) {
    const payload: DraggableTagPayload = {
        type: "tag",
        tagId: tag.id,
        tagPath: tag.path,
        tagName: tag.name,
        tagColor: tag.color,
        tagDescription: tag.description,
    };

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `tag-${tag.path}`,
        data: payload,
        disabled: isOverlay,
    });

    const tagColor = tag.color || "#3b82f6";

    if (isOverlay) {
        return (
            <div
                className="pointer-events-none cursor-grabbing inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/95 border border-primary/70 shadow-2xl ring-2 ring-primary/40 backdrop-blur-md select-none text-xs max-w-sm animate-in zoom-in-95 duration-100"
            >
                <div
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: tagColor }}
                />
                <span className="font-semibold text-foreground tracking-tight shrink-0">
                    {tag.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[180px]">
                    {tag.path}
                </span>
                <TagIcon className="w-3 h-3 text-primary shrink-0 opacity-80" />
            </div>
        );
    }

    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            title={`${tag.path}${tag.description ? ` • ${tag.description}` : ""}`}
            className={cn(
                "group relative flex items-center justify-between p-2 rounded-lg border select-none text-xs transition-all",
                isDragging
                    ? "opacity-30 border-dashed border-primary/60 bg-primary/5"
                    : "border-border/60 bg-card/50 hover:bg-card hover:border-border hover:shadow-xs cursor-grab active:cursor-grabbing"
            )}
        >
            <div className="flex items-center gap-2 min-w-0">
                <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
                <div
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                    style={{ backgroundColor: tagColor }}
                />
                <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-foreground truncate tracking-tight">
                        {tag.name}
                    </span>
                    <span
                        className="text-[10px] text-muted-foreground/70 truncate font-mono group-hover:text-muted-foreground transition-colors"
                        title={tag.path}
                    >
                        {tag.path}
                    </span>
                </div>
            </div>

            <div
                className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 flex items-center gap-1 border"
                style={{
                    backgroundColor: `${tagColor}15`,
                    color: tagColor,
                    borderColor: `${tagColor}30`,
                }}
            >
                <TagIcon className="w-2.5 h-2.5" />
                <span>{tag.name}</span>
            </div>
        </div>
    );
}
