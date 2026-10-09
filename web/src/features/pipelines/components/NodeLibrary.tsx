import { useState, useMemo, useCallback, useDeferredValue } from "react";
import { useNodePalette, usePipelineNodeMutations } from "../hooks/usePipelines";
import { useNodeLibraryTable } from "../hooks/useNodeLibraryTable";
import { NodeLibraryTable } from "./NodeLibraryTable";
import { PinBadge } from "./PinBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Search,
  Box,
  Workflow,
  ArrowRight,
  UploadCloud,
  X,
  Layers,
  Trash2,
  Loader2,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import type { NodePaletteItemDto } from "@/gen/model";
import { cn } from "@/lib/utils";
import { ScriptGuidelinesDialog } from "../dialogs/ScriptGuidelinesDialog";
import { useProjectNav } from "@/lib/navigation/useProjectNav";

interface NodeLibraryProps {
  projectId: string;
}

export function NodeLibrary({ projectId }: NodeLibraryProps) {
  const nav = useProjectNav({ projectId });
  const { data: nodes = [], isLoading } = useNodePalette(projectId);
  const { deleteNode, isDeletingNode } = usePipelineNodeMutations(projectId);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const isSearching = search !== deferredSearch;

  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [inspectingNode, setInspectingNode] = useState<NodePaletteItemDto | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => {
      if (n.category) set.add(n.category);
    });
    return ["All", "BuiltIn", "Custom", ...Array.from(set)];
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const isAll = selectedCategory === "All";
    const isCustom = selectedCategory === "Custom";
    const isBuiltIn = selectedCategory === "BuiltIn";

    return nodes.filter((node) => {
      const isStart =
        node.key?.toLowerCase() === "start" ||
        node.key?.toLowerCase() === "beginexecute" ||
        node.label?.toLowerCase() === "start" ||
        node.label?.toLowerCase() === "start pipeline";
      if (isStart) return false;

      // Hide sub-pipelines from the script library — they live in the canvas picker.
      if (node.source === "SubPipeline") return false;

      const matchCategory =
        isAll ||
        (isCustom && node.source === "Custom") ||
        (isBuiltIn && node.source !== "Custom") ||
        node.category === selectedCategory;

      if (!matchCategory) return false;

      if (!q) return true;

      return (
        node.label?.toLowerCase().includes(q) ||
        node.key?.toLowerCase().includes(q) ||
        node.category?.toLowerCase().includes(q) ||
        node.executor?.toLowerCase().includes(q)
      );
    });
  }, [nodes, deferredSearch, selectedCategory]);

  const handleDelete = useCallback(
    async (node: NodePaletteItemDto) => {
      if (!node.id) return;
      if (confirm(`Are you sure you want to delete custom node "${node.label || node.key}"?`)) {
        await deleteNode(node.id);
      }
    },
    [deleteNode]
  );

  const handleEdit = useCallback(
    (node: NodePaletteItemDto) => {
      if (!node.id) return;
      nav.toNodeNew(node.id);
    },
    [nav]
  );

  const handleInspect = useCallback((node: NodePaletteItemDto) => {
    setInspectingNode(node);
  }, []);

  const { table, columns, selectedNodes, setRowSelection } = useNodeLibraryTable({
    data: filteredNodes,
    onInspect: handleInspect,
    onEdit: handleEdit,
    onDelete: handleDelete,
  });

  const handleBulkDelete = async () => {
    const ids = selectedNodes.map((n) => n.id).filter(Boolean) as string[];
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      // No bulk endpoint yet — sequential delete keeps behaviour atomic per node
      // and reuses the existing invalidation. Replace with bulk API when available.
      for (const id of ids) {
        await deleteNode(id);
      }
      toast.success(`Deleted ${ids.length} custom node(s).`);
      setRowSelection({});
      setBulkDeleteOpen(false);
    } catch {
      // per-node toast already handled in usePipelineNodeMutations
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-full">
      {/* Header Bar — Batch Upload is the primary action, single create stays secondary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3.5">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Workflow className="size-5 text-primary" />
            Node Library
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Built-in pipeline tools and custom automation nodes for this project.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-xs"
            onPress={() => setGuidelinesOpen(true)}
          >
            <BookOpen className="size-3.5 text-primary" />
            Script Guidelines
          </Button>

          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-xs"
            onPress={() => nav.toNodeIngest()}
          >
            <UploadCloud className="size-3.5" />
            Upload Scripts
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative w-full sm:w-80">
            {isSearching ? (
              <Loader2 className="absolute left-2.5 top-2.5 size-3.5 text-primary animate-spin" />
            ) : (
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            )}
            <Input
              placeholder="Search nodes by name, key, or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-7 h-8 text-xs bg-muted/40 border-border/50"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 text-[11px] text-muted-foreground">
            <span>
              Showing <strong className="text-foreground">{filteredNodes.length}</strong> of {nodes.length} nodes
            </span>
            {(search || selectedCategory !== "All") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-foreground"
                onPress={() => {
                  setSearch("");
                  setSelectedCategory("All");
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {/* Scrollable Categories Pills */}
        <div className="flex items-center gap-1 overflow-x-auto py-1 max-w-full no-scrollbar">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <Button
                key={cat}
                variant={isSelected ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-6.5 text-[11px] px-2.5 rounded-full shrink-0 font-medium transition-all duration-150",
                  isSelected
                    ? "shadow-xs font-semibold"
                    : "text-muted-foreground border-border/60 hover:text-foreground hover:bg-muted/50"
                )}
                onPress={() => {
                  setSelectedCategory(cat);
                  setRowSelection({});
                }}
              >
                {cat}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Batch toolbar — only Custom rows are selectable */}
      {selectedNodes.length > 0 && (
        <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
          <button
            type="button"
            onClick={() => setRowSelection({})}
            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold transition-colors cursor-pointer"
            title="Click to clear selection"
          >
            <span>{selectedNodes.length} selected</span>
            <span className="text-[10px] opacity-70">✕</span>
          </button>

          <Button
            size="sm"
            variant="destructive"
            onClick={() => setBulkDeleteOpen(true)}
            isDisabled={isDeletingNode || isBulkDeleting}
            className="h-8 text-xs gap-1 px-2.5 cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            Delete ({selectedNodes.length})
          </Button>
        </div>
      )}

      {/* Node Table */}
      {isLoading ? (
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden p-4 space-y-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-muted/40 rounded animate-pulse" />
          ))}
        </div>
      ) : filteredNodes.length === 0 ? (
        <div className="text-center py-12 border rounded-xl border-dashed bg-muted/10 space-y-2.5">
          <Box className="size-8 text-muted-foreground mx-auto opacity-70" />
          <p className="font-semibold text-sm">No matching nodes found</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Try adjusting your search query or selecting a different category filter.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onPress={() => {
              setSearch("");
              setSelectedCategory("All");
            }}
          >
            Reset Filters
          </Button>
        </div>
      ) : (
        <div className={cn("transition-opacity duration-150", isSearching && "opacity-60 pointer-events-none")}>
          <NodeLibraryTable table={table} columns={columns} isLoading={isLoading} />
        </div>
      )}

      {/* Bulk delete confirmation */}
      <Dialog
        isOpen={bulkDeleteOpen}
        onOpenChange={(open) => !open && setBulkDeleteOpen(false)}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
            <Trash2 className="h-4 w-4" />
            <span>Delete {selectedNodes.length} custom node(s)?</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            This permanently deletes the selected custom nodes and their linked scripts:
            <span className="block mt-2 font-mono text-foreground max-h-32 overflow-y-auto">
              {selectedNodes.map((n) => n.label || n.key).join(", ")}
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={() => setBulkDeleteOpen(false)}
            isDisabled={isBulkDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onPress={handleBulkDelete}
            isDisabled={isBulkDeleting}
          >
            {isBulkDeleting ? "Deleting..." : `Delete ${selectedNodes.length}`}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* Inspect Node Specification Modal */}
      {inspectingNode && (
        <Dialog
          isOpen={!!inspectingNode}
          onOpenChange={(isOpen) => !isOpen && setInspectingNode(null)}
          className="sm:max-w-xl"
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Layers className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold">
                  {inspectingNode.label || inspectingNode.key}
                </DialogTitle>
                <div className="text-[11px] font-mono text-muted-foreground">
                  {inspectingNode.key} • {inspectingNode.category || "General"}
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 text-xs py-2 max-h-[60vh] overflow-y-auto pr-1">
            {/* Properties summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50 text-[11px]">
              <div>
                <span className="text-muted-foreground block text-[10px]">Source</span>
                <span className="font-semibold">{inspectingNode.source}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Executor</span>
                <span className="font-semibold">{inspectingNode.executor}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px]">Total Pins</span>
                <span className="font-semibold">
                  {(inspectingNode.inputs?.length || 0) + (inspectingNode.outputs?.length || 0)}
                </span>
              </div>
            </div>

            {/* Inputs Specification */}
            <div className="space-y-2">
              <h4 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                <ArrowRight className="size-3 text-blue-500" />
                Input Pins ({inspectingNode.inputs?.length || 0})
              </h4>
              <div className="space-y-1.5 rounded-lg border border-border/50 p-2 bg-background/50">
                {inspectingNode.inputs && inspectingNode.inputs.length > 0 ? (
                  inspectingNode.inputs.map((pin) => (
                    <div key={pin.id} className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/40">
                      <PinBadge pin={pin} direction="in" />
                      {pin.isRequired && (
                        <span className="text-[10px] text-destructive font-medium">Required</span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground text-[11px] italic py-1">No inputs defined.</div>
                )}
              </div>
            </div>

            {/* Outputs Specification */}
            <div className="space-y-2">
              <h4 className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                <ArrowRight className="size-3 text-emerald-500" />
                Output Pins ({inspectingNode.outputs?.length || 0})
              </h4>
              <div className="space-y-1.5 rounded-lg border border-border/50 p-2 bg-background/50">
                {inspectingNode.outputs && inspectingNode.outputs.length > 0 ? (
                  inspectingNode.outputs.map((pin) => (
                    <div key={pin.id} className="flex items-center justify-between gap-2 p-1 rounded hover:bg-muted/40">
                      <PinBadge pin={pin} direction="out" />
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground text-[11px] italic py-1">No outputs defined.</div>
                )}
              </div>
            </div>
          </div>
        </Dialog>
      )}

      {/* Script Standards & Registry Guidelines Modal */}
      <ScriptGuidelinesDialog
        isOpen={guidelinesOpen}
        onClose={() => setGuidelinesOpen(false)}
        onOpenBatchUpload={() => {
          setGuidelinesOpen(false);
          nav.toNodeIngest();
        }}
      />
    </div>
  );
}
