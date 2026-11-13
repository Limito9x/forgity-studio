import { useState, useMemo, useEffect, useRef } from "react";
import type { NodePaletteItemDto } from "@/gen/model";
import {
  generateLocalStructPaletteItems,
  generateComponentPipePaletteItems,
} from "../../utils/structPaletteGenerator";
import { generateConstantPaletteItems } from "../../utils/constantPaletteGenerator";
import { useNodePalette } from "../../hooks/usePipelines";
import { useLocalPaletteQuery, useLocalPipelinesQuery, useLocalConstantsQuery } from "../../hooks/workspace";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";

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
  projectId,
  rootPath = null,
  pipelineKind = "master",
  componentExecutor,
  currentPipelineId,
  onSelect,
}: ContextMenuPaletteProps) {
  const [search, setSearch] = useState("");
  const isComponentPipe = pipelineKind === "component";
  const executorParam = isComponentPipe ? componentExecutor || "blender" : undefined;

  const { data: paletteItems = [], isLoading } = useNodePalette(projectId, executorParam);
  const { draftNodes, localStructs } = useLocalPaletteQuery(rootPath);
  const { pipelines: scannedDraftPipelines } = useLocalPipelinesQuery(rootPath);
  const { constants, resolvedConstants } = useLocalConstantsQuery(rootPath);
  const isDesktop = isTauriRuntime();
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
    const items = paletteItems.filter(
      (item) =>
        item.key.toLowerCase() !== "start" &&
        item.key.toLowerCase() !== "beginexecute" &&
        item.key.toLowerCase() !== "return" &&
        item.label.toLowerCase() !== "start" &&
        item.label.toLowerCase() !== "start pipeline" &&
        item.label.toLowerCase() !== "return" &&
        (!currentPipelineId || (
          item.key.toLowerCase() !== currentPipelineId.toLowerCase() &&
          item.id?.toLowerCase() !== currentPipelineId.toLowerCase()
        ))
    );

    // Local-First: Khi ở Desktop Local Workspace, tuyệt đối KHÔNG kéo actions từ server DB
    const combined: NodePaletteItemDto[] = isDesktop ? [] : [...items];
    if (isDesktop && draftNodes) {
      const localItems: NodePaletteItemDto[] = Object.values(draftNodes)
        .filter((draft) => {
          if (!executorParam) return true;
          const draftExec = draft.executor.toLowerCase();
          const targetExec = executorParam.toLowerCase();
          return draftExec === targetExec || (draftExec === "python" && ["blender", "unreal"].includes(targetExec));
        })
        .map((draft) => ({
          key: `local:${draft.key}`,
          label: draft.suggestedLabel || draft.suggestedName || draft.fileName,
          category: "Local Scripts",
          source: "LocalDraft" as any,
          executor: draft.executor,
          inputs: draft.inputs || [],
          outputs: draft.outputs || [],
          description: draft.description || draft.fullPath,
          id: `local:${draft.key}`,
          isVisibleInPalette: true,
        }));
      combined.push(...localItems);
    }

    // Merge auto-generated Local Structs Make/Break companion nodes
    if (isDesktop && localStructs && localStructs.length > 0) {
      const structNodes = generateLocalStructPaletteItems(localStructs);
      combined.push(...structNodes);
    }

    // Merge auto-generated Component Pipes as sub-pipeline tools
    if (!isComponentPipe && isDesktop && scannedDraftPipelines && scannedDraftPipelines.length > 0) {
      const componentPipes = scannedDraftPipelines.filter((p) => p.pipelineKind === "component");
      if (componentPipes.length > 0) {
        const compNodes = generateComponentPipePaletteItems(componentPipes);
        combined.push(...compNodes);
      }
    }

    // Merge local machine constants as pure data nodes
    if (isDesktop && constants && constants.length > 0) {
      const constNodes = generateConstantPaletteItems(constants, resolvedConstants);
      combined.push(...constNodes);
    }

    const q = search.trim().toLowerCase();
    if (!q) return combined;
    return combined.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        (item.category && item.category.toLowerCase().includes(q))
    );
  }, [paletteItems, draftNodes, localStructs, scannedDraftPipelines, isDesktop, executorParam, search, currentPipelineId, isComponentPipe]);

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
