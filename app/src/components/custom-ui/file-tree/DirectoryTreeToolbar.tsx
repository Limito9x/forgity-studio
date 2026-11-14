import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, RefreshCw, FolderTree, Minimize2, ArrowLeft, Folder } from "lucide-react";

interface DirectoryTreeToolbarProps {
  searchTerm: string;
  currentPath?: string;
  canNavigateUp?: boolean;
  onSearchChange: (value: string) => void;
  onRefresh?: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onNavigateUp?: () => void;
  isRefreshing?: boolean;
}

export function DirectoryTreeToolbar({
  searchTerm,
  currentPath,
  canNavigateUp = false,
  onSearchChange,
  onRefresh,
  onExpandAll,
  onCollapseAll,
  onNavigateUp,
  isRefreshing,
}: DirectoryTreeToolbarProps) {
  return (
    <div className="flex flex-col gap-2 p-2 border-b border-border/40 bg-muted/20">
      {/* Current Path Indicator */}
      {currentPath !== undefined && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-background/90 rounded-md border border-border/50 text-xs font-mono text-foreground/80 truncate shadow-2xs">
          <Folder className="size-3.5 text-amber-500 shrink-0" />
          <span className="truncate" title={currentPath || "Root Directory"}>
            {currentPath || "Root Drives"}
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Navigate Up / Back */}
        {onNavigateUp && (
          <div title={canNavigateUp ? "Go Up / Parent Directory" : "At Root Directory"}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onNavigateUp}
              isDisabled={isRefreshing || !canNavigateUp}
              className="size-8"
            >
              <ArrowLeft className="size-3.5" />
            </Button>
          </div>
        )}

        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter files..."
            className="h-8 pl-8 text-xs bg-background"
          />
        </div>

        {/* Expand All */}
        {onExpandAll && (
          <div title="Expand All">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onExpandAll}
              className="size-8"
            >
              <FolderTree className="size-3.5" />
            </Button>
          </div>
        )}

        {/* Collapse All */}
        {onCollapseAll && (
          <div title="Collapse All">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onCollapseAll}
              className="size-8"
            >
              <Minimize2 className="size-3.5" />
            </Button>
          </div>
        )}

        {/* Refresh */}
        {onRefresh && (
          <div title="Refresh Tree">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onRefresh}
              isDisabled={isRefreshing}
              className="size-8"
            >
              <RefreshCw className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
