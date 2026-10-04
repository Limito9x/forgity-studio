import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import type { WorkspaceResourceDto } from "@/gen/model";
import { cn } from "@/lib/utils";

interface DraggableResourceRowHandleProps {
  resource: WorkspaceResourceDto;
  selectedIds: string[];
}

export function DraggableResourceRowHandle({
  resource,
  selectedIds,
}: DraggableResourceRowHandleProps) {
  const isSelected = selectedIds.includes(resource.id);
  const resourceIdsToDrag = isSelected && selectedIds.length > 0 ? selectedIds : [resource.id];

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: resource.id,
    data: {
      resourceIds: resourceIdsToDrag,
      displayName: resource.displayName || resource.name,
    },
  });

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      className={cn(
        "cursor-grab active:cursor-grabbing p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors shrink-0",
        isDragging && "opacity-30"
      )}
      title="Drag to assign content"
    >
      <GripVertical className="size-4" />
    </button>
  );
}
