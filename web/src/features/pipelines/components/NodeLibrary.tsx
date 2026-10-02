import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useNodePalette, usePipelineNodeMutations } from "../hooks/usePipelines";
import { PinBadge } from "./PinBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Box,
  Sparkles,
  Trash2,
  Workflow,
  ArrowRight,
  UploadCloud,
  Zap,
  X,
  Layers,
  FileCode,
  SlidersHorizontal,
} from "lucide-react";
import type { NodePaletteItemDto, PinDefinition } from "@/gen/model";
import { cn } from "@/lib/utils";
import { getSoftwareMetadata } from "@/features/runners/constants/dccEngines";

interface NodeLibraryProps {
  projectId: string;
}

function isExecPin(pin: PinDefinition): boolean {
  return (
    pin.kind === 1 ||
    String(pin.id || "").toLowerCase() === "exec" ||
    String(pin.id || "").toLowerCase() === "exec_in" ||
    String(pin.id || "").toLowerCase() === "exec_out" ||
    String(pin.id || "").toLowerCase() === "loop_body" ||
    String(pin.id || "").toLowerCase() === "completed"
  );
}

export function NodeLibrary({ projectId }: NodeLibraryProps) {
  const navigate = useNavigate();
  const { data: nodes = [], isLoading } = useNodePalette(projectId);
  const { deleteNode, isDeletingNode } = usePipelineNodeMutations(projectId);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [inspectingNode, setInspectingNode] = useState<NodePaletteItemDto | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => {
      if (n.category) set.add(n.category);
    });
    return ["All", "BuiltIn", "Custom", ...Array.from(set)];
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      const isStart =
        node.key?.toLowerCase() === "start" ||
        node.key?.toLowerCase() === "beginexecute" ||
        node.label?.toLowerCase() === "start" ||
        node.label?.toLowerCase() === "start pipeline";
      if (isStart) return false;

      const q = search.trim().toLowerCase();
      const matchSearch =
        q === "" ||
        node.label?.toLowerCase().includes(q) ||
        node.key?.toLowerCase().includes(q) ||
        node.category?.toLowerCase().includes(q) ||
        node.executor?.toLowerCase().includes(q);

      const matchCategory =
        selectedCategory === "All" ||
        (selectedCategory === "Custom" && node.source === "Custom") ||
        (selectedCategory === "BuiltIn" && node.source === "BuiltIn") ||
        node.category === selectedCategory;

      return matchSearch && matchCategory;
    });
  }, [nodes, search, selectedCategory]);

  const handleDelete = async (node: NodePaletteItemDto) => {
    if (!node.id) return;
    if (confirm(`Are you sure you want to delete custom node "${node.label || node.key}"?`)) {
      await deleteNode(node.id);
    }
  };

  return (
    <div className="space-y-4 max-w-full">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3.5">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Workflow className="size-5 text-primary" />
            Node Library
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Built-in pipeline tools and isolated automation nodes for this project.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-xs"
            onPress={() =>
              navigate({
                to: "/projects/$projectId/pipeline/nodes/ingest",
                params: { projectId },
              })
            }
          >
            <UploadCloud className="size-3.5 text-primary" />
            Batch Upload
          </Button>

          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-xs"
            onPress={() =>
              navigate({
                to: "/projects/$projectId/pipeline/nodes/new",
                params: { projectId },
              })
            }
          >
            <Plus className="size-3.5" />
            Create Custom Node
          </Button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
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
                onPress={() => setSelectedCategory(cat)}
              >
                {cat}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Node Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-40 rounded-xl border bg-card/60 animate-pulse p-3 space-y-2.5">
              <div className="h-4 bg-muted rounded w-3/4" />
              <div className="h-3 bg-muted/60 rounded w-1/2" />
              <div className="h-12 bg-muted/30 rounded mt-4" />
            </div>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
          {filteredNodes.map((node) => {
            const isCustom = node.source === "Custom";
            const dataInputs = (node.inputs || []).filter((p) => !isExecPin(p));
            const dataOutputs = (node.outputs || []).filter((p) => !isExecPin(p));
            const hasExec = (node.inputs || []).some(isExecPin) || (node.outputs || []).some(isExecPin);

            const dccMeta = node.executor ? getSoftwareMetadata(node.executor) : null;
            const executorName =
              node.executor?.toLowerCase() === "dotnet" || node.executor?.toLowerCase() === "builtin"
                ? "Core"
                : dccMeta?.name || node.executor;

            return (
              <Card
                key={node.key}
                className="group relative flex flex-col justify-between border border-border/70 bg-card/80 hover:border-primary/50 hover:bg-card hover:shadow-md transition-all duration-150 rounded-xl overflow-hidden"
              >
                {/* Header */}
                <CardHeader className="p-3 pb-2 space-y-1.5">
                  {/* Top metadata tags */}
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 truncate min-w-0">
                      <Badge
                        variant="secondary"
                        className="text-[9px] h-4.5 px-1.5 font-semibold shrink-0 uppercase tracking-wider"
                      >
                        {isCustom ? (
                          <span className="flex items-center gap-1 text-primary">
                            <Sparkles className="size-2" /> Custom
                          </span>
                        ) : (
                          "Built-in"
                        )}
                      </Badge>

                      {hasExec && (
                        <Badge
                          variant="outline"
                          className="text-[9px] h-4.5 px-1 font-mono text-amber-500 border-amber-500/30 bg-amber-500/10 shrink-0"
                          title="Has Execution Flow"
                        >
                          <Zap className="size-2.5 mr-0.5" /> Flow
                        </Badge>
                      )}

                      {node.category && (
                        <span className="text-[10px] text-muted-foreground/80 truncate font-medium">
                          {node.category}
                        </span>
                      )}
                    </div>

                    {executorName && (
                      <Badge
                        variant="outline"
                        className="text-[9px] h-4.5 px-1.5 font-mono shrink-0"
                        style={dccMeta?.brandColor ? { borderColor: `${dccMeta.brandColor}55`, color: dccMeta.brandColor } : undefined}
                      >
                        {dccMeta?.iconUrl ? (
                          <img src={dccMeta.iconUrl} alt={executorName} className="size-2.5 mr-1 object-contain" />
                        ) : null}
                        {executorName}
                      </Badge>
                    )}
                  </div>

                  {/* Node Name & Key */}
                  <div className="min-w-0 pt-0.5">
                    <CardTitle
                      className="text-xs font-bold truncate text-foreground group-hover:text-primary transition-colors"
                      title={node.label || node.key}
                    >
                      {node.label || node.key}
                    </CardTitle>
                    <div className="text-[10px] font-mono text-muted-foreground truncate" title={node.key}>
                      {node.key}
                    </div>
                  </div>
                </CardHeader>

                {/* Content: Compact Data Pins */}
                <CardContent className="p-3 pt-0 text-xs flex-1 flex flex-col justify-between space-y-2">
                  <div className="space-y-1.5 pt-2 border-t border-border/40">
                    {/* Inputs */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
                        <span className="flex items-center gap-1">
                          <ArrowRight className="size-2.5 text-blue-500" />
                          In ({dataInputs.length})
                        </span>
                        {dataInputs.length > 2 && (
                          <button
                            onClick={() => setInspectingNode(node)}
                            className="text-[10px] text-primary hover:underline font-mono"
                          >
                            +{dataInputs.length - 2} more
                          </button>
                        )}
                      </div>

                      {dataInputs.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {dataInputs.slice(0, 2).map((pin) => (
                            <PinBadge key={pin.id} pin={pin} direction="in" compact />
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground/60 italic">None</div>
                      )}
                    </div>

                    {/* Outputs */}
                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-medium">
                        <span className="flex items-center gap-1">
                          <ArrowRight className="size-2.5 text-emerald-500" />
                          Out ({dataOutputs.length})
                        </span>
                        {dataOutputs.length > 2 && (
                          <button
                            onClick={() => setInspectingNode(node)}
                            className="text-[10px] text-primary hover:underline font-mono"
                          >
                            +{dataOutputs.length - 2} more
                          </button>
                        )}
                      </div>

                      {dataOutputs.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {dataOutputs.slice(0, 2).map((pin) => (
                            <PinBadge key={pin.id} pin={pin} direction="out" compact />
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] text-muted-foreground/60 italic">None</div>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="flex items-center justify-between gap-1 pt-2 border-t border-border/40 text-[11px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[10px] px-1.5 text-muted-foreground hover:text-foreground gap-1"
                      onPress={() => setInspectingNode(node)}
                    >
                      <SlidersHorizontal className="size-3" />
                      Inspect
                    </Button>

                    {isCustom && node.id && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] px-1.5 text-muted-foreground hover:text-foreground gap-0.5"
                          onPress={() =>
                            navigate({
                              to: "/projects/$projectId/pipeline/nodes/new",
                              params: { projectId },
                              search: { editNodeId: node.id } as any,
                            })
                          }
                        >
                          <FileCode className="size-3" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          isDisabled={isDeletingNode}
                          onPress={() => handleDelete(node)}
                          aria-label="Delete node"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

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
    </div>
  );
}
