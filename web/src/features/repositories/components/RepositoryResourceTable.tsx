import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  pointerWithin,
} from "@dnd-kit/core";
import { BaseTable } from "@/components/table/BaseTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Layers, Unlink, FileCode } from "lucide-react";
import { toast } from "sonner";
import { AssignContentSidePanel } from "./drawers/AssignContentSidePanel";
import { useRepositoryResourceTable } from "../hooks/useRepositoryResourceTable";
import type { WorkspaceResourceDto } from "@/gen/model";

interface RepositoryResourceTableProps {
  data: WorkspaceResourceDto[];
  totalCount: number;
  isLoading: boolean;
  projectId: string;
  repositoryId: string;
}

export function RepositoryResourceTable({
  data,
  totalCount,
  isLoading,
  projectId,
  repositoryId,
}: RepositoryResourceTableProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeDragItem, setActiveDragItem] = useState<{
    id: string;
    resourceIds: string[];
    displayName?: string;
  } | null>(null);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (r) =>
        (r.displayName && r.displayName.toLowerCase().includes(q)) ||
        (r.name && r.name.toLowerCase().includes(q)) ||
        (r.relativePath && r.relativePath.toLowerCase().includes(q)) ||
        (r.contentName && r.contentName.toLowerCase().includes(q)) ||
        (r.contentTypeName && r.contentTypeName.toLowerCase().includes(q))
    );
  }, [data, search]);

  const handleOpenAssignPanel = useCallback((_resourceId?: string) => {
    setIsPanelOpen(true);
  }, []);

  const {
    table,
    columns,
    selectedRowIds,
    setRowSelection,
    handleBatchUnlink,
    assignMutation,
  } = useRepositoryResourceTable({
    data: filteredData,
    totalCount: filteredData.length,
    projectId,
    repositoryId,
    onOpenAssignPanel: handleOpenAssignPanel,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const dragData = event.active.data.current as {
      resourceIds: string[];
      displayName?: string;
    } | undefined;

    setActiveDragItem({
      id: event.active.id as string,
      resourceIds: dragData?.resourceIds || [event.active.id as string],
      displayName: dragData?.displayName,
    });

    setIsPanelOpen(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);

    if (!over || !over.id) return;

    const targetContentId = over.id as string;
    const dragData = active.data.current as { resourceIds: string[] } | undefined;
    const resourceIdsToAssign = dragData?.resourceIds || [active.id as string];

    if (resourceIdsToAssign.length === 0) return;

    assignMutation.mutate(
      {
        data: {
          resourceIds: resourceIdsToAssign,
          contentId: targetContentId,
        },
      },
      {
        onSuccess: () => {
          toast.success(`Assigned ${resourceIdsToAssign.length} resource(s) to content.`);
          setRowSelection({});
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to assign content.");
        },
      }
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex items-start gap-4">
        {/* Left Side: Content Drop Targets Panel */}
        {isPanelOpen && (
          <div className="w-80 lg:w-96 shrink-0 sticky top-4">
            <AssignContentSidePanel
              isOpen={isPanelOpen}
              onClose={() => setIsPanelOpen(false)}
              projectId={projectId}
              repositoryId={repositoryId}
              selectedResourceIds={selectedRowIds}
              onAssignSuccess={() => {
                setRowSelection({});
              }}
            />
          </div>
        )}

        {/* Right Side: Table Toolbar + Selection Bar + Table */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Table Toolbar & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, path, content..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Batch Actions when items are selected */}
              {selectedRowIds.length > 0 && (
                <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
                  <button
                    type="button"
                    onClick={() => setRowSelection({})}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold transition-colors cursor-pointer"
                    title="Click to clear selection"
                  >
                    <span>{selectedRowIds.length} selected</span>
                    <span className="text-[10px] opacity-70">✕</span>
                  </button>

                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleBatchUnlink}
                    isDisabled={assignMutation.isPending}
                    className="h-8 text-xs gap-1 px-2.5 cursor-pointer"
                  >
                    <Unlink className="size-3.5" />
                    Unlink ({selectedRowIds.length})
                  </Button>
                </div>
              )}

              {/* Toggle Left Content Panel */}
              <Button
                size="sm"
                variant={isPanelOpen ? "default" : "outline"}
                onClick={() => setIsPanelOpen(!isPanelOpen)}
                className="h-8 text-xs gap-1.5 font-medium shadow-xs cursor-pointer"
              >
                <Layers className="size-3.5" />
                {isPanelOpen ? "Hide Content Panel" : "Assign Content Panel"}
              </Button>

              {/* Total Count */}
              <div className="text-xs text-muted-foreground font-medium pl-1">
                <span className="text-foreground font-semibold">{filteredData.length}</span> /{" "}
                <span className="text-foreground font-semibold">{totalCount}</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <BaseTable
            table={table}
            columns={columns}
            isLoading={isLoading}
            caption="Repository Resources List"
          />
        </div>
      </div>

      {/* Drag Overlay (Floating Card while dragging) */}
      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-card/95 backdrop-blur-md text-foreground rounded-xl border border-primary shadow-2xl ring-4 ring-primary/10 select-none pointer-events-none whitespace-nowrap min-w-max">
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
              <FileCode className="size-4" />
            </div>
            <div className="flex flex-col min-w-0 pr-1 text-left">
              <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                {activeDragItem.displayName || "Selected File"}
              </span>
              {activeDragItem.resourceIds.length > 1 && (
                <span className="text-[10px] text-muted-foreground font-medium">
                  +{activeDragItem.resourceIds.length - 1} other files selected
                </span>
              )}
            </div>
            <span className="flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold shrink-0 ml-1">
              {activeDragItem.resourceIds.length}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
