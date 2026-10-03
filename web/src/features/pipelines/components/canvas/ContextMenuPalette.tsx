import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNodePalette } from "../../hooks/usePipelines";
import type { NodePaletteItemDto } from "@/gen/model";
import { Search, Box, FileCode, Plus, X, Cpu, Server, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ScopeContainerNodeData } from "./ScopeContainerNode";
import { getStageKindName } from "./hooks/canvasUtils";

export type StageCreationOption = {
  type: "stage";
  name: string;
  kind: "Worker" | "Server" | "Macro";
  executorKey: string;
};

interface ContextMenuPaletteProps {
  projectId: string;
  position: { x: number; y: number } | null;
  targetStage?: ScopeContainerNodeData | null;
  onClose: () => void;
  onSelect: (item: NodePaletteItemDto) => void;
  onCreateStage?: (stage: StageCreationOption) => void;
}

export function ContextMenuPalette({
  projectId,
  position,
  targetStage,
  onClose,
  onSelect,
  onCreateStage,
}: ContextMenuPaletteProps) {
  const [search, setSearch] = useState("");

  const kindName = targetStage ? getStageKindName(targetStage.kind) : null;
  const isWorkerStage = kindName === "Worker";
  const isServerStage = kindName === "Server";
  const isMacroStage = kindName === "Macro";

  const executorParam = targetStage
    ? isMacroStage
      ? "macro"
      : isServerStage
        ? "server"
        : targetStage.executorKey || "blender"
    : undefined;

  const { data: paletteItems = [], isLoading } = useNodePalette(projectId, executorParam);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (position) {
      setSearch("");
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [position]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    if (position) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [position, onClose]);

  // Stage Creation Options when right-clicking on empty canvas
  const stageOptions: StageCreationOption[] = useMemo(() => [
    { type: "stage", name: "Python Stage", kind: "Worker", executorKey: "python" },
    { type: "stage", name: "Blender Stage", kind: "Worker", executorKey: "blender" },
    { type: "stage", name: "Unreal Stage", kind: "Worker", executorKey: "unreal" },
    { type: "stage", name: "Core Services", kind: "Server", executorKey: "dotNet" },
    { type: "stage", name: "Macro Stage", kind: "Macro", executorKey: "dotNet" },
  ], []);

  // Filtered items (Server already handles scoped executor filtering)
  const filteredItems = useMemo(() => {
    // On root canvas (no stage selected), standalone tools are not allowed; only Stages can be spawned
    if (!targetStage) {
      return [];
    }

    let items = paletteItems.filter(
      (item) =>
        item.key.toLowerCase() !== "start" &&
        item.key.toLowerCase() !== "beginexecute" &&
        item.label.toLowerCase() !== "start" &&
        item.label.toLowerCase() !== "start pipeline"
    );

    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q))
    );
  }, [paletteItems, search, targetStage]);

  // Filtered stage options when adding to root canvas
  const filteredStages = useMemo(() => {
    if (!onCreateStage || targetStage) return [];
    const q = search.trim().toLowerCase();
    if (!q) return stageOptions;
    return stageOptions.filter(
      (s) => s.name.toLowerCase().includes(q) || s.kind.toLowerCase().includes(q)
    );
  }, [onCreateStage, targetStage, stageOptions, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, NodePaletteItemDto[]>();
    for (const item of filteredItems) {
      const cat = item.category || (item.source === "Tool" ? "Built-in Tools" : "Custom Nodes");
      if (!map.has(cat)) {
        map.set(cat, []);
      }
      map.get(cat)!.push(item);
    }
    return Array.from(map.entries());
  }, [filteredItems]);

  if (!position) return null;

  // Keep menu within viewport
  const style: React.CSSProperties = {
    top: Math.min(position.y, window.innerHeight - 380),
    left: Math.min(position.x, window.innerWidth - 320),
  };

  return (
    <div
      ref={containerRef}
      style={style}
      className="fixed z-50 w-72 rounded-xl border border-border/80 bg-popover p-2 shadow-2xl animate-in fade-in zoom-in-95 duration-100"
    >
      {targetStage && (
        <div className="mb-2 px-2 py-1 bg-muted/60 rounded-md flex items-center justify-between text-[11px] text-muted-foreground border border-border/40">
          <span className="truncate">Adding to: <strong className="text-foreground font-semibold">{targetStage.name}</strong></span>
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-background font-mono font-semibold">
            {isWorkerStage ? (targetStage.executorKey || "DCC").toUpperCase() : isServerStage ? "CORE" : "MACRO"}
          </span>
        </div>
      )}

      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={targetStage ? `Search tools for ${targetStage.name}...` : "Search stage scopes..."}
          className="h-8.5 pl-8 pr-7 text-xs bg-muted/50 border-border/50 focus-visible:ring-1"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <ScrollArea className="h-64 pr-1">
        {isLoading ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Loading palette...</div>
        ) : grouped.length === 0 && filteredStages.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {targetStage ? "No matching tools found" : "No matching stage scopes found"}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStages.length > 0 && (
              <div className="space-y-1">
                <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="h-3 w-3" /> Stage Scopes
                </span>
                <div className="space-y-0.5">
                  {filteredStages.map((stage) => {
                    const icon =
                      stage.kind === "Worker" ? (
                        <Cpu className="h-3 w-3" />
                      ) : stage.kind === "Server" ? (
                        <Server className="h-3 w-3" />
                      ) : (
                        <Layers className="h-3 w-3" />
                      );
                    const color =
                      stage.kind === "Worker"
                        ? "bg-amber-500/10 text-amber-500"
                        : stage.kind === "Server"
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-purple-500/10 text-purple-500";
                    return (
                      <button
                        key={stage.name}
                        onClick={() => {
                          onCreateStage?.(stage);
                          onClose();
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded", color)}>
                            {icon}
                          </div>
                          <span className="block truncate font-medium text-foreground group-hover:text-primary">
                            {stage.name}
                          </span>
                        </div>
                        <Plus className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {grouped.map(([category, items]) => (
              <div key={category} className="space-y-1">
                <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {category}
                </span>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const isTool = item.source === "Tool";
                    return (
                      <button
                        key={item.key}
                        onClick={() => {
                          onSelect(item);
                          onClose();
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground group"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={cn(
                              "flex h-5 w-5 shrink-0 items-center justify-center rounded",
                              isTool ? "bg-blue-500/10 text-blue-500" : "bg-purple-500/10 text-purple-500"
                            )}
                          >
                            {isTool ? <Box className="h-3 w-3" /> : <FileCode className="h-3 w-3" />}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate font-medium text-foreground group-hover:text-primary">
                              {item.label}
                            </span>
                          </div>
                        </div>
                        <Plus className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-primary shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {!targetStage && (
        <div className="mt-2 pt-1.5 border-t border-border/40 text-[10px] text-muted-foreground/70 px-1 text-center">
          Right-click inside a Stage to add tools
        </div>
      )}
    </div>
  );
}
