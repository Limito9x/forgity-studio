import { useState, useMemo } from "react";
import { useDiscoverRunnerFolder, useRunners } from "@/features/runners/hooks/useRunners";
import type { DirectoryNodeDto, SystemPlaceDto } from "@/gen/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  FolderOpen,
  File,
  FileCode,
  Gamepad2,
  Box,
  Check,
  Disc,
  Layers,
  Home,
  Monitor,
  Download,
  FileText,
  Pin,
  PinOff,
  Star,
} from "lucide-react";

export type BrowserMode = "folder" | "file" | "both";

export interface FolderItem {
  name: string;
  path: string;
  isDirectory?: boolean;
  sizeBytes?: number;
  extension?: string | null;
  hasChildren?: boolean;
}

interface DiskItem {
  mount: string;
  label?: string | null;
  totalBytes?: number | null;
  freeBytes?: number | null;
}

interface FolderBrowserProps {
  runnerId: string;
  initialPath?: string;
  selectedPath?: string;
  onSelectPath?: (path: string, item?: DirectoryNodeDto) => void;
  onDoubleClickItem?: (item: DirectoryNodeDto) => void;
  mode?: BrowserMode;
  extensions?: string[];
  className?: string;
  height?: number;
}

function formatBytes(bytes?: number | null, decimals = 1): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function FolderBrowser({
  runnerId,
  initialPath = "",
  selectedPath,
  onSelectPath,
  onDoubleClickItem,
  mode = "folder",
  extensions,
  className = "",
  height = 420,
}: FolderBrowserProps) {
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: allRunners } = useRunners();
  const currentRunner = allRunners?.find((r) => r.id === runnerId);
  const hardwareDisks: DiskItem[] = (currentRunner?.hardwareDetails?.disks as DiskItem[]) || [];

  const includeFiles = mode !== "folder";
  const extensionsParam =
    extensions && extensions.length > 0 ? extensions.join(",") : undefined;

  const { data, isLoading, isFetching, error, refetch } = useDiscoverRunnerFolder(
    runnerId,
    {
      path: currentPath || undefined,
      includeFiles,
      extensions: extensionsParam,
    }
  );

  const items = data?.items ?? [];
  const parentPath = data?.parentPath ?? "";
  const canNavigateUp = Boolean(data?.canNavigateUp);
  const systemPlaces = (data?.systemPlaces ?? []) as SystemPlaceDto[];
  const errorMessage = error ? (error as any)?.message || "Could not load directory." : null;

  // Local pinned folders storage synced with runner pinned folders
  const [localPinned, setLocalPinned] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`pinned_folders_${runnerId}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const togglePin = (folderPath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLocalPinned((prev) => {
      const next = prev.includes(folderPath)
        ? prev.filter((p) => p !== folderPath)
        : [...prev, folderPath];
      try {
        localStorage.setItem(`pinned_folders_${runnerId}`, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const allPinnedFolders = useMemo(() => {
    const serverPinned = (data?.pinnedFolders ?? []) as string[];
    return Array.from(new Set([...serverPinned, ...localPinned]));
  }, [data?.pinnedFolders, localPinned]);

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

  // Available disk drives with realtime capacity from server
  const availableDisks: DiskItem[] = useMemo(() => {
    const serverDrives = data?.drives;
    if (serverDrives && serverDrives.length > 0) {
      return serverDrives.map((d) => ({
        mount: d.mount,
        label: d.label,
        totalBytes: d.totalBytes,
        freeBytes: d.freeBytes,
      }));
    }

    if (hardwareDisks.length > 0) return hardwareDisks;

    // Fallback extract from root items if at root level
    if (!currentPath && items.length > 0) {
      return items
        .filter((it) => it.path.includes(":"))
        .map((it) => ({
          mount: it.path,
          label: it.name,
          totalBytes: null,
          freeBytes: null,
        }));
    }
    return [];
  }, [data?.drives, hardwareDisks, currentPath, items]);

  // Filter items by search term
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items;
    return items.filter((item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [items, searchTerm]);

  // Handle navigate to specific directory
  const handleNavigate = (path: string, autoSelect = false) => {
    setCurrentPath(path);
    if (autoSelect && path && mode !== "file" && onSelectPath) {
      onSelectPath(path);
    }
  };

  // Handle navigate up (Back button)
  const handleNavigateUp = () => {
    if (canNavigateUp) {
      handleNavigate(parentPath, mode !== "file");
    }
  };

  // Helper icon for System Places
  const getPlaceIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("home")) return <Home className="size-3.5 text-blue-400 shrink-0" />;
    if (lower.includes("desktop")) return <Monitor className="size-3.5 text-indigo-400 shrink-0" />;
    if (lower.includes("download")) return <Download className="size-3.5 text-emerald-400 shrink-0" />;
    if (lower.includes("document")) return <FileText className="size-3.5 text-amber-400 shrink-0" />;
    return <Folder className="size-3.5 text-muted-foreground shrink-0" />;
  };

  // Helper icon for items
  const getItemIcon = (item: DirectoryNodeDto, isDrive: boolean) => {
    if (isDrive) {
      return <HardDrive className="size-4 text-primary shrink-0" />;
    }
    if (item.isDirectory ?? true) {
      return <Folder className="size-4 text-amber-500 fill-amber-500/20 shrink-0" />;
    }

    const ext = (item.extension || "").toLowerCase();
    if (ext === ".uproject") {
      return <Gamepad2 className="size-4 text-cyan-400 shrink-0" />;
    }
    if (ext === ".blend") {
      return <Box className="size-4 text-orange-400 shrink-0" />;
    }
    if ([".py", ".sh", ".bat", ".cmd", ".ps1"].includes(ext)) {
      return <FileCode className="size-4 text-emerald-400 shrink-0" />;
    }
    return <File className="size-4 text-muted-foreground shrink-0" />;
  };

  return (
    <div
      className={cn(
        "flex flex-col border border-border/60 rounded-xl bg-card overflow-hidden shadow-xs text-xs w-full",
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
                  onClick={() => !isLast && handleNavigate(crumb.path, mode !== "file")}
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

      {/* Main 2-Panel Area: Left Sidebar (System & Pinned) + Right Explorer */}
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] divide-y md:divide-y-0 md:divide-x divide-border/30 w-full">
        {/* Left Sidebar (Blender-style System & Drives) */}
        <div
          className="bg-muted/15 p-2 flex flex-col gap-3 overflow-y-auto"
          style={{ height: `${height}px` }}
        >
          {/* Section 1: System Places */}
          {systemPlaces.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider px-1.5 flex items-center gap-1">
                <Monitor className="size-3 text-primary/70" />
                <span>System Places</span>
              </span>

              {systemPlaces.map((place) => {
                const normalizedPlace = place.path.replace(/\\/g, "/");
                const isCurrent =
                  Boolean(currentPath) &&
                  currentPath.replace(/\\/g, "/").toLowerCase() === normalizedPlace.toLowerCase();

                return (
                  <button
                    key={place.name}
                    type="button"
                    onClick={() => handleNavigate(normalizedPlace, mode !== "file")}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors text-xs select-none",
                      isCurrent
                        ? "bg-primary/15 text-primary font-medium border border-primary/20"
                        : "text-foreground hover:bg-accent/50 border border-transparent"
                    )}
                    title={place.path}
                  >
                    {getPlaceIcon(place.name)}
                    <span className="truncate">{place.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Section 2: Drives */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider px-1.5 flex items-center gap-1">
              <Disc className="size-3 text-primary/70" />
              <span>Drives</span>
            </span>

            <button
              type="button"
              onClick={() => handleNavigate("", mode !== "file")}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors text-xs select-none",
                !currentPath
                  ? "bg-primary/15 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <HardDrive className="size-3.5 text-primary shrink-0" />
              <span className="truncate">All Drives</span>
            </button>

            {availableDisks.map((d) => {
              const normalizedMount = (d.mount || "").replace(/\\/g, "/");
              const isCurrent =
                Boolean(currentPath) &&
                currentPath.replace(/\\/g, "/").toLowerCase().startsWith(normalizedMount.toLowerCase());

              const usedBytes =
                d.totalBytes && d.freeBytes ? d.totalBytes - d.freeBytes : 0;
              const usedPercent =
                d.totalBytes && d.totalBytes > 0
                  ? Math.round((usedBytes / d.totalBytes) * 100)
                  : null;

              return (
                <button
                  key={d.mount}
                  type="button"
                  onClick={() => handleNavigate(normalizedMount, mode !== "file")}
                  className={cn(
                    "w-full flex flex-col gap-1 px-2 py-1.5 rounded-md text-left transition-colors text-xs select-none group",
                    isCurrent
                      ? "bg-primary/15 text-primary font-medium border border-primary/20"
                      : "text-foreground hover:bg-accent/50 border border-transparent"
                  )}
                  title={`${d.mount} ${d.label || ""} (${d.freeBytes != null ? `${formatBytes(d.freeBytes)} free` : ""})`}
                >
                  <div className="flex items-center justify-between gap-1 w-full min-w-0">
                    <div className="flex items-center gap-1.5 truncate">
                      <HardDrive className={cn("size-3.5 shrink-0", isCurrent ? "text-primary" : "text-muted-foreground")} />
                      <span className="truncate font-medium">{d.mount}</span>
                      {d.label && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          [{d.label}]
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Free space mini progress */}
                  {d.freeBytes != null && (
                    <div className="w-full space-y-0.5">
                      <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono">
                        <span>{formatBytes(d.freeBytes)} free</span>
                        {usedPercent !== null && <span>{usedPercent}%</span>}
                      </div>
                      {usedPercent !== null && (
                        <div className="w-full h-1 bg-border/60 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              usedPercent > 90
                                ? "bg-destructive"
                                : usedPercent > 75
                                ? "bg-amber-500"
                                : "bg-primary/70"
                            )}
                            style={{ width: `${Math.min(usedPercent, 100)}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Section 3: Pinned Folders */}
          {allPinnedFolders.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-border/30">
              <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider px-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <Star className="size-3 text-amber-400 fill-amber-400/20" />
                  <span>Pinned</span>
                </div>
                <span className="text-[9px] text-muted-foreground font-mono font-normal">
                  ({allPinnedFolders.length})
                </span>
              </span>

              {allPinnedFolders.map((pinned) => {
                const normalized = pinned.replace(/\\/g, "/");
                const folderName = normalized.split("/").filter(Boolean).pop() || normalized;
                const isCurrent =
                  Boolean(currentPath) &&
                  currentPath.replace(/\\/g, "/").toLowerCase() === normalized.toLowerCase();

                return (
                  <div
                    key={pinned}
                    onClick={() => handleNavigate(normalized, mode !== "file")}
                    className={cn(
                      "w-full flex items-center justify-between gap-1 px-2 py-1 rounded-md text-left transition-colors text-xs select-none cursor-pointer group",
                      isCurrent
                        ? "bg-primary/15 text-primary font-medium border border-primary/20"
                        : "text-foreground hover:bg-accent/50 border border-transparent"
                    )}
                    title={pinned}
                  >
                    <div className="flex items-center gap-1.5 truncate min-w-0">
                      <Folder className="size-3.5 text-amber-500 fill-amber-500/20 shrink-0" />
                      <span className="truncate text-[11px]">{folderName}</span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => togglePin(pinned, e)}
                      title="Unpin folder"
                      className="opacity-0 group-hover:opacity-100 hover:text-destructive p-0.5 transition-opacity"
                    >
                      <PinOff className="size-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Section 4: Target Machine Info */}
          <div className="space-y-1 pt-2 border-t border-border/30 mt-auto">
            <span className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider px-1.5 flex items-center gap-1">
              <Layers className="size-3 text-muted-foreground/70" />
              <span>Target Machine</span>
            </span>
            <div className="px-2 py-1 text-[11px] text-muted-foreground space-y-0.5">
              <p className="font-semibold text-foreground truncate">
                {currentRunner?.name || "Runner Machine"}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground/80 truncate">
                {currentRunner?.machineKey || "Online"}
              </p>
            </div>
          </div>
        </div>

        {/* Right Content Explorer */}
        <div className="flex flex-col min-w-0 w-full">
          {/* Search Input Bar */}
          <div className="px-2.5 py-1.5 border-b border-border/30 bg-background/50">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  mode === "file"
                    ? "Filter files & folders in current directory..."
                    : "Filter folders in this directory..."
                }
                className="h-7 pl-7.5 text-xs bg-background"
              />
            </div>
          </div>

          {/* Directory Item List (Explorer View) */}
          <div
            className="relative overflow-y-auto p-1 divide-y divide-border/20 flex-1"
            style={{ height: `${height - 37}px` }}
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
                  Retry
                </Button>
              </div>
            )}

            {/* Loading Overlay */}
            {isLoading && items.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4">
                <Loader2 className="size-6 animate-spin text-primary" />
                <span className="text-xs">Scanning runner filesystem...</span>
              </div>
            )}

            {/* Empty State */}
            {!errorMessage && !isLoading && filteredItems.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-4 text-center">
                <FolderOpen className="size-8 opacity-40 text-muted-foreground" />
                <p className="text-xs">
                  {searchTerm ? "No matching items found." : "Directory is empty."}
                </p>
              </div>
            )}

            {/* List of Items */}
            {!errorMessage &&
              filteredItems.map((item) => {
                const isDir = item.isDirectory ?? true;
                const isSelected = selectedPath === item.path;
                const isDrive = !currentPath && item.path.includes(":");
                const canSelect = mode === "both" || (mode === "file" ? !isDir : isDir);
                const isPinned = isDir && allPinnedFolders.includes(item.path);

                return (
                  <div
                    key={item.path}
                    onClick={() => {
                      if (canSelect) {
                        onSelectPath?.(item.path, item);
                      }
                    }}
                    onDoubleClick={() => {
                      if (isDir) {
                        handleNavigate(item.path, mode !== "file");
                      } else {
                        onSelectPath?.(item.path, item);
                        onDoubleClickItem?.(item);
                      }
                    }}
                    className={cn(
                      "group flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer transition-all select-none",
                      isSelected
                        ? "bg-primary/15 border border-primary/40 text-primary font-medium shadow-2xs"
                        : "hover:bg-accent/60 text-foreground border border-transparent",
                      !canSelect && !isDir && "opacity-60 cursor-not-allowed"
                    )}
                  >
                    {/* Left: Icon & Name */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {getItemIcon(item, isDrive)}
                      <span className="truncate text-xs">{item.name}</span>
                      {!isDir && item.extension && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[9px] uppercase px-1 py-0 h-4 font-mono",
                            item.extension.toLowerCase() === ".uproject"
                              ? "border-cyan-500/40 text-cyan-500 bg-cyan-500/10"
                              : item.extension.toLowerCase() === ".blend"
                              ? "border-orange-500/40 text-orange-500 bg-orange-500/10"
                              : "border-border text-muted-foreground"
                          )}
                        >
                          {item.extension.replace(".", "")}
                        </Badge>
                      )}
                    </div>

                    {/* Right: Actions / Info */}
                    <div className="flex items-center gap-2 shrink-0 opacity-80 group-hover:opacity-100">
                      {/* Pin button for directories */}
                      {isDir && !isDrive && (
                        <button
                          type="button"
                          onClick={(e) => togglePin(item.path, e)}
                          title={isPinned ? "Unpin folder" : "Pin folder to sidebar"}
                          className={cn(
                            "p-1 rounded hover:bg-accent transition-colors",
                            isPinned
                              ? "opacity-100 text-amber-400"
                              : "opacity-0 group-hover:opacity-70 hover:opacity-100 text-muted-foreground"
                          )}
                        >
                          <Pin className={cn("size-3.5", isPinned && "fill-amber-400/30 text-amber-400")} />
                        </button>
                      )}

                      {!isDir && (
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {formatBytes(item.sizeBytes)}
                        </span>
                      )}
                      {isSelected && (
                        <span className="flex items-center gap-1 text-[11px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">
                          <Check className="size-3" />
                          Selected
                        </span>
                      )}
                      {isDir && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNavigate(item.path, mode !== "file");
                          }}
                          className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent"
                        >
                          <span>Open</span>
                          <ChevronRight className="size-3 ml-0.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
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

        {mode !== "file" && currentPath && (
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

// Re-export under RemoteFileBrowser alias as well
export { FolderBrowser as RemoteFileBrowser };
