import { useState, useMemo, useRef } from "react";
import { Search, Plus, AlertTriangle, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SlideThumbnailCard } from "./SlideThumbnailCard";
import type { AnalyzedCustomNodeDto } from "@/gen/model";

interface DeckSidebarProps {
  nodes: AnalyzedCustomNodeDto[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onRemoveNode: (key: string) => void;
  onAddMoreFiles: (files: File[]) => void;
}

type FilterType = "all" | "new" | "modified" | "breaking";

export function DeckSidebar({
  nodes,
  selectedIndex,
  onSelectIndex,
  onRemoveNode,
  onAddMoreFiles,
}: DeckSidebarProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    let newCount = 0;
    let modCount = 0;
    let breakingCount = 0;
    nodes.forEach((n) => {
      if (n.isOverride) modCount++;
      else newCount++;
      if ((n.impactReport?.affectedEdgeCount ?? 0) > 0) breakingCount++;
    });
    return { newCount, modCount, breakingCount, total: nodes.length };
  }, [nodes]);

  const filteredNodesWithIndex = useMemo(() => {
    return nodes
      .map((node, originalIndex) => ({ node, originalIndex }))
      .filter(({ node }) => {
        // Filter by type
        if (filterType === "new" && node.isOverride) return false;
        if (filterType === "modified" && !node.isOverride) return false;
        if (filterType === "breaking" && (node.impactReport?.affectedEdgeCount ?? 0) === 0)
          return false;

        // Search query
        if (!search.trim()) return true;
        const query = search.toLowerCase();
        return (
          node.fileName?.toLowerCase().includes(query) ||
          node.suggestedLabel?.toLowerCase().includes(query) ||
          node.key?.toLowerCase().includes(query)
        );
      });
  }, [nodes, filterType, search]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddMoreFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  return (
    <div className="w-80 shrink-0 border-r border-border bg-card/40 flex flex-col h-full overflow-hidden">
      {/* Sidebar Header */}
      <div className="p-3.5 border-b border-border space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Script Slides ({nodes.length})
            </h2>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 px-2"
            onPress={() => fileInputRef.current?.click()}
          >
            <Plus className="size-3.5" />
            Add .py
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".py"
            className="hidden"
            onChange={handleFileInputChange}
          />
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search scripts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs bg-background/60"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px]">
          <Button
            variant={filterType === "all" ? "secondary" : "ghost"}
            size="sm"
            className={cn("h-6 text-[11px] px-2", filterType === "all" && "font-semibold")}
            onPress={() => setFilterType("all")}
          >
            All ({stats.total})
          </Button>

          <Button
            variant={filterType === "new" ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-6 text-[11px] px-2 text-emerald-600 dark:text-emerald-400",
              filterType === "new" && "font-semibold"
            )}
            onPress={() => setFilterType("new")}
          >
            New ({stats.newCount})
          </Button>

          <Button
            variant={filterType === "modified" ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-6 text-[11px] px-2 text-amber-600 dark:text-amber-400",
              filterType === "modified" && "font-semibold"
            )}
            onPress={() => setFilterType("modified")}
          >
            Mod ({stats.modCount})
          </Button>

          {stats.breakingCount > 0 && (
            <Button
              variant={filterType === "breaking" ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-6 text-[11px] px-2 text-destructive",
                filterType === "breaking" && "font-semibold"
              )}
              onPress={() => setFilterType("breaking")}
            >
              <AlertTriangle className="size-2.5 mr-0.5" />
              Impact ({stats.breakingCount})
            </Button>
          )}
        </div>
      </div>

      {/* Slide Thumbnails Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filteredNodesWithIndex.length === 0 ? (
          <div className="text-center py-10 px-4 text-xs text-muted-foreground">
            No scripts match the current filter.
          </div>
        ) : (
          filteredNodesWithIndex.map(({ node, originalIndex }) => (
            <SlideThumbnailCard
              key={node.key}
              node={node}
              index={originalIndex}
              isSelected={originalIndex === selectedIndex}
              onClick={() => onSelectIndex(originalIndex)}
              onRemove={() => onRemoveNode(node.key)}
            />
          ))
        )}
      </div>
    </div>
  );
}
