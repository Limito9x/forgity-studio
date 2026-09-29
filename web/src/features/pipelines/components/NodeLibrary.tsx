import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useNodePalette, usePipelineNodeMutations } from "../hooks/usePipelines";
import { PinBadge } from "./PinBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Plus,
  Search,
  Box,
  Sparkles,
  Trash2,
  Cpu,
  Workflow,
  ArrowRight,
  Filter,
  UploadCloud,
} from "lucide-react";
import type { NodePaletteItemDto } from "@/gen/model";

interface NodeLibraryProps {
  projectId: string;
}

export function NodeLibrary({ projectId }: NodeLibraryProps) {
  const navigate = useNavigate();
  const { data: nodes = [], isLoading } = useNodePalette(projectId);
  const { deleteNode, isDeletingNode } = usePipelineNodeMutations(projectId);

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => {
      if (n.category) set.add(n.category);
    });
    return ["All", "BuiltIn", ...Array.from(set)];
  }, [nodes]);

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      const isStart =
        node.key?.toLowerCase() === "start" ||
        node.key?.toLowerCase() === "beginexecute" ||
        node.label?.toLowerCase() === "start" ||
        node.label?.toLowerCase() === "start pipeline";
      if (isStart) return false;

      const matchSearch =
        search === "" ||
        node.label?.toLowerCase().includes(search.toLowerCase()) ||
        node.key?.toLowerCase().includes(search.toLowerCase());

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
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Workflow className="size-6 text-primary" />
            Node Library
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Explore built-in tools and manage custom Python / Blender automation nodes for this project.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            className="gap-2"
            onPress={() =>
              navigate({
                to: "/projects/$projectId/pipeline/nodes/ingest",
                params: { projectId },
              })
            }
          >
            <UploadCloud className="size-4 text-primary" />
            Batch Upload Scripts
          </Button>

          <Button
            className="gap-2"
            onPress={() =>
              navigate({
                to: "/projects/$projectId/pipeline/nodes/new",
                params: { projectId },
              })
            }
          >
            <Plus className="size-4" />
            Create Custom Node
          </Button>
        </div>
      </div>



      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search nodes by name or key..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto w-full pb-1 sm:pb-0">
          <Filter className="size-3.5 text-muted-foreground mr-1 shrink-0" />
          {categories.map((cat) => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs shrink-0"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {/* Node Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-48 rounded-xl border bg-card animate-pulse p-4 space-y-3">
              <div className="h-5 bg-muted rounded w-1/2" />
              <div className="h-4 bg-muted/60 rounded w-1/3" />
              <div className="h-20 bg-muted/30 rounded" />
            </div>
          ))}
        </div>
      ) : filteredNodes.length === 0 ? (
        <div className="text-center py-16 border rounded-xl border-dashed bg-muted/10 space-y-3">
          <Box className="size-10 text-muted-foreground mx-auto" />
          <p className="font-semibold text-base">No nodes found</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            No node matches your current search or category filter. Try clearing filters or create a new custom node.
          </p>
          <Button variant="outline" size="sm" onClick={() => { setSearch(""); setSelectedCategory("All"); }}>
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNodes.map((node) => {
            const isCustom = node.source === "Custom";
            const inputCount = node.inputs?.length || 0;
            const outputCount = node.outputs?.length || 0;

            return (
              <Card
                key={node.key}
                className="group relative flex flex-col justify-between border shadow-sm hover:border-primary/50 hover:shadow-md transition duration-200"
              >
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <CardTitle className="text-sm font-bold truncate">
                          {node.label || node.key}
                        </CardTitle>
                      </div>
                      <CardDescription className="text-[11px] font-mono text-muted-foreground truncate">
                        {node.key}
                      </CardDescription>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant={isCustom ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0 uppercase tracking-wider font-semibold"
                      >
                        {isCustom ? (
                          <span className="flex items-center gap-1">
                            <Sparkles className="size-2.5" />
                            Custom
                          </span>
                        ) : (
                          "Built-in"
                        )}
                      </Badge>
                      {node.executor && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                          <Cpu className="size-2.5 mr-1 text-muted-foreground" />
                          {node.executor}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 pt-0 space-y-3 text-xs flex-1 flex flex-col justify-between">
                  {/* Pins Summary */}
                  <div className="space-y-2 pt-2 border-t border-border/50">
                    {/* Inputs */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <ArrowRight className="size-3 text-blue-500" />
                        Inputs ({inputCount}):
                      </div>
                      {inputCount > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                          {node.inputs?.map((pin) => (
                            <PinBadge key={pin.id} pin={pin} direction="in" />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">None</span>
                      )}
                    </div>

                    {/* Outputs */}
                    <div className="space-y-1 pt-1">
                      <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <ArrowRight className="size-3 text-emerald-500" />
                        Outputs ({outputCount}):
                      </div>
                      {outputCount > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                          {node.outputs?.map((pin) => (
                            <PinBadge key={pin.id} pin={pin} direction="out" />
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic">None</span>
                      )}
                    </div>
                  </div>

                  {/* Footer with Actions */}
                  {isCustom && node.id && (
                    <div className="flex items-center justify-end gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onPress={() =>
                          navigate({
                            to: "/projects/$projectId/pipeline/nodes/new",
                            params: { projectId },
                            search: { editNodeId: node.id } as any,
                          })
                        }
                      >
                        <Workflow className="size-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                        isDisabled={isDeletingNode}
                        onPress={() => handleDelete(node)}
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

