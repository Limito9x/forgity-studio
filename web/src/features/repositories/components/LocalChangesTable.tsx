import { useState, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import type { ResourceDiffItem } from "@/gen/model";
import {
  FilePlus,
  FileEdit,
  FileMinus,
  Layers,
  ArrowUpCircle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type DiffStatus = "added" | "modified" | "deleted" | "missing";

export type DiffItemWithStatus = ResourceDiffItem & {
  status: DiffStatus;
};

export interface LocalChangesTableProps {
  items: DiffItemWithStatus[];
  selectedPaths: Set<string>;
  onToggleSelect: (path: string) => void;
  onToggleSelectAll: () => void;
  filterStatus?: "all" | DiffStatus;
  onFilterStatusChange?: (status: "all" | DiffStatus) => void;
}

export function formatFileSize(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function LocalChangesTable({
  items,
  selectedPaths,
  onToggleSelect,
  onToggleSelectAll,
  filterStatus = "all",
  onFilterStatusChange,
}: LocalChangesTableProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const counts = useMemo(() => {
    const added = items.filter((i) => i.status === "added").length;
    const modified = items.filter((i) => i.status === "modified").length;
    const missing = items.filter((i) => i.status === "missing" || i.status === "deleted").length;
    return { added, modified, missing, total: items.length };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchStatus =
        filterStatus === "all" ||
        item.status === filterStatus ||
        (filterStatus === "deleted" && item.status === "missing");
      const matchSearch =
        !searchTerm.trim() ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.relativePath.toLowerCase().includes(searchTerm.toLowerCase());
      return matchStatus && matchSearch;
    });
  }, [items, filterStatus, searchTerm]);

  const isAllSelected =
    filteredItems.length > 0 &&
    filteredItems.every((i) => selectedPaths.has(i.relativePath));
  const isSomeSelected =
    filteredItems.some((i) => selectedPaths.has(i.relativePath)) &&
    !isAllSelected;

  const filterTabs: Array<{ id: "all" | DiffStatus; label: string; count: number }> = [
    { id: "all", label: "All Changes", count: counts.total },
    { id: "added", label: "New Files", count: counts.added },
    { id: "modified", label: "Modified", count: counts.modified },
    { id: "missing", label: "Deleted", count: counts.missing },
  ];

  return (
    <div className="w-full space-y-3 p-4">
      {/* Filter Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {onFilterStatusChange && (
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border/60 w-fit">
            {filterTabs.map((tab) => {
              const isActive = filterStatus === tab.id;
              return (
                <Button
                  key={tab.id}
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => onFilterStatusChange(tab.id)}
                  className={cn(
                    "h-7 px-2.5 text-xs font-medium gap-1.5 cursor-pointer rounded-lg",
                    isActive
                      ? "bg-background text-foreground font-semibold shadow-xs border border-border/50 hover:bg-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  )}
                >
                  <span>{tab.label}</span>
                  <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 font-mono">
                    {tab.count}
                  </Badge>
                </Button>
              );
            })}
          </div>
        )}

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search changed files..."
            className="h-8 pl-8 text-xs bg-background"
          />
        </div>
      </div>

      {/* React Aria Shadcn Table */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden [&_[data-slot=table-container]]:max-h-[420px] [&_[data-slot=table-container]]:overflow-y-auto">
        <Table aria-label="Local pending changes" selectionMode="multiple">
          <TableHeader className="sticky top-0 z-20 bg-card border-b border-border/60 shadow-2xs">
            <TableHead id="select" className="w-10 text-center sticky top-0 bg-card z-20 border-b border-border/60">
              <Checkbox
                slot="selection"
                isSelected={isAllSelected}
                isIndeterminate={isSomeSelected}
                onChange={onToggleSelectAll}
                aria-label="Select all items"
              />
            </TableHead>
            <TableHead id="file" isRowHeader className="min-w-[240px] sticky top-0 bg-card z-20 border-b border-border/60">
              File & Path
            </TableHead>
            <TableHead id="changeType" className="min-w-[120px] sticky top-0 bg-card z-20 border-b border-border/60">Change Type</TableHead>
            <TableHead id="size" className="min-w-[90px] sticky top-0 bg-card z-20 border-b border-border/60">Size</TableHead>
            <TableHead id="action" className="min-w-[180px] sticky top-0 bg-card z-20 border-b border-border/60">Planned Action</TableHead>
          </TableHeader>
          <TableBody
            renderEmptyState={() => (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground space-y-2">
                <Layers className="size-8 opacity-40" />
                <p className="text-sm font-medium">No changes matching criteria</p>
                <p className="text-xs opacity-75">
                  {searchTerm
                    ? "Try clearing your search filter."
                    : "Local files match the repository state."}
                </p>
              </div>
            )}
          >
            {filteredItems.map((item) => {
              const isSelected = selectedPaths.has(item.relativePath);

              return (
                <TableRow
                  key={item.relativePath}
                  id={item.relativePath}
                  data-selected={isSelected}
                  onClick={() => onToggleSelect(item.relativePath)}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                >
                  {/* Selection Checkbox */}
                  <TableCell
                    id={`${item.relativePath}-select`}
                    className="text-center"
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <Checkbox
                      slot="selection"
                      isSelected={isSelected}
                      onChange={() => onToggleSelect(item.relativePath)}
                      aria-label={`Select ${item.name}`}
                    />
                  </TableCell>

                  {/* File Path */}
                  <TableCell>
                    <div className="min-w-0 py-1">
                      <div className="font-medium text-foreground truncate">{item.name}</div>
                      <div
                        className="font-mono text-[11px] text-muted-foreground truncate"
                        title={item.relativePath}
                      >
                        {item.relativePath}
                      </div>
                    </div>
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell>
                    {item.status === "added" && (
                      <Badge
                        variant="outline"
                        className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-[10px] gap-1 font-mono"
                      >
                        <FilePlus className="size-3" /> New
                      </Badge>
                    )}
                    {item.status === "modified" && (
                      <Badge
                        variant="outline"
                        className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-[10px] gap-1 font-mono"
                      >
                        <FileEdit className="size-3" /> Modified
                      </Badge>
                    )}
                    {(item.status === "missing" || item.status === "deleted") && (
                      <Badge
                        variant="outline"
                        className="text-rose-500 border-rose-500/30 bg-rose-500/10 text-[10px] gap-1 font-mono"
                      >
                        <FileMinus className="size-3" /> Missing
                      </Badge>
                    )}
                  </TableCell>

                  {/* File Size */}
                  <TableCell>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatFileSize(item.localFileSize)}
                    </span>
                  </TableCell>

                  {/* Planned Action */}
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <ArrowUpCircle className="size-3.5 text-primary/70 shrink-0" />
                      <span className="truncate">
                        {item.status === "added"
                          ? "Add & create initial version"
                          : item.status === "modified"
                          ? "Upload new version revision"
                          : "Mark deleted from local runner"}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
