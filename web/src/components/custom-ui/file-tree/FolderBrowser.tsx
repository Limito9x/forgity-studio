import { useState, useMemo } from "react";
import { useDiscoverRunnerFolder } from "@/features/runners/hooks/useRunners";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  RefreshCw,
  Search,
  Folder,
  HardDrive,
  ChevronRight,
  AlertCircle,
  Loader2,
  FolderCheck,
  FolderOpen,
} from "lucide-react";

export interface FolderItem {
  name: string;
  path: string;
}

interface FolderBrowserProps {
  runnerId: string;
  initialPath?: string;
  selectedPath?: string;
  onSelectPath?: (path: string) => void;
  className?: string;
  height?: number;
}

export function FolderBrowser({
  runnerId,
  initialPath = "",
  selectedPath,
  onSelectPath,
  className = "",
  height = 320,
}: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [searchTerm, setSearchTerm] = useState("");

  const { data, isLoading, isFetching, error, refetch } = useDiscoverRunnerFolder(
    runnerId,
    currentPath
  );

  const items = data?.items ?? [];
  const parentPath = data?.parentPath ?? "";
  const canNavigateUp = Boolean(data?.canNavigateUp);
  const errorMessage = error ? (error as any)?.message || "Could not load directory." : null;

  // Compute breadcrumbs from currentPath
  const breadcrumbs = useMemo(() => {
    const list: { label: string; path: string; isRoot?: boolean }[] = [
      { label: "Drives", path: "", isRoot: true },
    ];
    if (!currentPath) return list;

    const normalized = currentPath.replace(/\\/g, "/").replace(/\/$/, "");
    const parts = normalized.split("/").filter(Boolean);

    let accumulated = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === 0 && /^[a-zA-Z]:$/.test(part)) {
        accumulated = `${part}/`;
        list.push({ label: part, path: accumulated });
      } else {
        if (accumulated.endsWith("/")) {
          accumulated += part;
        } else {
          accumulated += `/${part}`;
        }
        list.push({ label: part, path: accumulated });
      }
    }
    return list;
  }, [currentPath]);

  // Filter items by search term
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    return items.filter((item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  // Handle navigate to specific directory
  const handleNavigate = (path: string, autoSelect = true) => {
    setCurrentPath(path);
    if (autoSelect && path && onSelectPath) {
      onSelectPath(path);
    }
  };

  // Handle navigate up (Back button)
  const handleNavigateUp = () => {
    if (canNavigateUp) {
      handleNavigate(parentPath, true);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col border border-border/60 rounded-xl bg-card overflow-hidden shadow-xs text-xs",
        className
      )}
    >
      {/* Top Header / Breadcrumb Bar */}
      <div className="flex items-center gap-1.5 p-2 bg-muted/30 border-b border-border/40 overflow-x-auto select-none scrollbar-thin">
        <div title={canNavigateUp ? `Go up to ${parentPath || "Drives"}` : "At Root Drives"}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleNavigateUp}
            isDisabled={isLoading || !canNavigateUp}
            className="size-7 shrink-0"
          >
            <ArrowLeft className="size-3.5" />
          </Button>
        </div>

        {/* Breadcrumb Chips */}
        <div className="flex items-center gap-1 flex-1 overflow-x-auto no-scrollbar font-mono text-[11px]">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <div key={crumb.path || "root"} className="flex items-center gap-1 shrink-0">
                {idx > 0 && <ChevronRight className="size-3 text-muted-foreground/50 shrink-0" />}
                <button
                  type="button"
                  onClick={() => !isLast && handleNavigate(crumb.path, true)}
                  disabled={isLast || isLoading}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors text-xs",
                    isLast
                      ? "bg-primary/10 text-primary font-semibold cursor-default"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                  )}
                  title={crumb.path || "Drives"}
                >
                  {crumb.isRoot ? (
                    <HardDrive className="size-3 text-primary shrink-0" />
                  ) : (
                    <Folder className="size-3 text-amber-500 shrink-0" />
                  )}
                  <span className="truncate max-w-[120px]">{crumb.label}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Refresh Button */}
        <div title="Refresh current folder">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => refetch()}
            isDisabled={isFetching}
            className="size-7 shrink-0"
          >
            <RefreshCw className={cn("size-3.5", isFetching && "animate-spin text-primary")} />
          </Button>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="px-2 py-1.5 border-b border-border/30 bg-background/50">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter folders in this directory..."
            className="h-7 pl-7.5 text-xs bg-background"
          />
        </div>
      </div>

      {/* Directory Item List (Explorer View) */}
      <div
        className="relative overflow-y-auto p-1 divide-y divide-border/20"
        style={{ height: `${height}px` }}
      >
        {/* Error State */}
        {errorMessage && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-destructive p-4 text-center">
            <AlertCircle className="size-6" />
            <p className="font-medium text-xs">{errorMessage}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="mt-1 h-7 text-xs"
            >
              Thử lại
            </Button>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="text-xs">Scanning directory...</span>
          </div>
        )}

        {/* Empty State */}
        {!errorMessage && !isLoading && filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4 text-center">
            <FolderOpen className="size-8 opacity-40 text-muted-foreground" />
            <p className="text-xs">
              {searchTerm ? "No folders found." : "No items found."}
            </p>
          </div>
        )}

        {/* List of Folders */}
        {!errorMessage &&
          filteredItems.map((item) => {
            const isSelected = selectedPath === item.path;
            const isDrive = !currentPath && item.path.includes(":");

            return (
              <div
                key={item.path}
                onClick={() => onSelectPath?.(item.path)}
                onDoubleClick={() => handleNavigate(item.path, true)}
                className={cn(
                  "group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all select-none",
                  isSelected
                    ? "bg-primary/15 border border-primary/40 text-primary font-medium shadow-2xs"
                    : "hover:bg-accent/60 text-foreground border border-transparent"
                )}
              >
                {/* Left: Icon & Name */}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isDrive ? (
                    <HardDrive className="size-4 text-primary shrink-0" />
                  ) : (
                    <Folder className="size-4 text-amber-500 fill-amber-500/20 shrink-0" />
                  )}
                  <span className="truncate text-xs">{item.name}</span>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100">
                  {isSelected && (
                    <span className="flex items-center gap-1 text-[11px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">
                      <FolderCheck className="size-3" />
                      Selected
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleNavigate(item.path, true);
                    }}
                    className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent"
                  >
                    <span>Open</span>
                    <ChevronRight className="size-3 ml-0.5" />
                  </Button>
                </div>
              </div>
            );
          })}
      </div>

      {/* Footer Info / Selected Path Preview */}
      <div className="p-2 border-t border-border/40 bg-muted/20 flex items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-1.5 truncate text-muted-foreground">
          <span className="font-semibold text-foreground">Selected:</span>
          <span
            className="font-mono text-foreground truncate max-w-[280px]"
            title={selectedPath || "None"}
          >
            {selectedPath || "None"}
          </span>
        </div>

        {currentPath && (
          <div title="Select Current Folder">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectPath?.(currentPath)}
              className="h-6 px-2 text-[11px] font-medium shrink-0"
            >
              Select Current
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
