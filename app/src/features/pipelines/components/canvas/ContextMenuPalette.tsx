import { useState, useMemo, useEffect, useRef } from "react";
import type { NodePaletteItemDto } from "@/gen/model";
import { usePipelineWorkspace } from "../../context/PipelineWorkspaceContext";

interface ContextMenuPaletteProps {
  position: { x: number; y: number } | null;
  onClose: () => void;
  projectId: string;
  rootPath?: string | null;
  pipelineKind?: "component" | "master";
  componentExecutor?: string;
  currentPipelineId?: string;
  onSelect: (item: NodePaletteItemDto) => void;
}

export function ContextMenuPalette({
  position,
  onClose,
  pipelineKind = "master",
  componentExecutor,
  currentPipelineId,
  onSelect,
}: ContextMenuPaletteProps) {
  const [search, setSearch] = useState("");
  const isComponentPipe = pipelineKind === "component";
  const executorParam = isComponentPipe ? componentExecutor || "blender" : undefined;

  const { paletteItems, isLoadingPalette: isLoading } = usePipelineWorkspace();
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

  const filteredItems = useMemo(() => {
    const combined = paletteItems.filter((item) => {
      const keyLower = item.key.toLowerCase();
      const labelLower = item.label.toLowerCase();
      if (
        keyLower === "start" ||
        keyLower === "beginexecute" ||
        keyLower === "return" ||
        labelLower === "start" ||
        labelLower === "start pipeline" ||
        labelLower === "return"
      ) {
        return false;
      }
      if (
        currentPipelineId &&
        (keyLower === currentPipelineId.toLowerCase() ||
          item.id?.toLowerCase() === currentPipelineId.toLowerCase())
      ) {
        return false;
      }
      // Trong Component Pipe: không lồng Component Pipe khác và lọc theo executor tương thích
      if (isComponentPipe) {
        if (keyLower.startsWith("local:component:")) return false;
        if (executorParam && item.executor) {
          const itemExec = item.executor.toLowerCase();
          const targetExec = executorParam.toLowerCase();
          if (
            itemExec !== targetExec &&
            itemExec !== "pure" &&
            !(itemExec === "python" && ["blender", "unreal"].includes(targetExec))
          ) {
            return false;
          }
        }
      }
      return true;
    });

    const q = search.trim().toLowerCase();
    if (!q) return combined;
    return combined.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q))
    );
  }, [paletteItems, executorParam, search, currentPipelineId, isComponentPipe]);

  if (!position) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 w-72 max-h-[420px] rounded-xl border border-border/80 bg-popover/95 p-2 shadow-2xl backdrop-blur-md flex flex-col gap-2 animate-in fade-in zoom-in-95 duration-100"
      style={{
        left: Math.min(position.x, window.innerWidth - 300),
        top: Math.min(position.y, window.innerHeight - 440),
      }}
    >
      {/* Search Input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search actions or scripts..."
          className="w-full h-8 px-3 text-xs bg-muted/60 border border-border/60 rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Content list */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-1 custom-scrollbar text-xs">
        {isLoading && <div className="text-center py-4 text-muted-foreground">Loading actions...</div>}

        {!isLoading && filteredItems.length === 0 && (
          <div className="text-center py-4 text-muted-foreground">No matching actions found</div>
        )}

        {filteredItems.map((item) => (
          <button
            key={item.id || item.key}
            type="button"
            onClick={() => {
              onSelect(item);
              onClose();
            }}
            className="w-full text-left px-2 py-1.5 rounded-md hover:bg-accent/80 hover:text-accent-foreground flex items-center justify-between group transition-colors cursor-pointer"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-foreground truncate">{item.label}</span>
              <span className="text-[10px] text-muted-foreground truncate">{item.key}</span>
            </div>
            {item.executor && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase font-mono shrink-0 ml-2">
                {item.executor}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
