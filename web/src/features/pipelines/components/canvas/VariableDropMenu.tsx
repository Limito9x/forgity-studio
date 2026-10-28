import { useEffect, useRef } from "react";
import { Pill, Zap, Variable, Ban } from "lucide-react";

interface VariableDropMenuProps {
  varName: string;
  position: { x: number; y: number } | null;
  isInsideStage?: boolean;
  onSelect: (action: "Get" | "Set") => void;
  onClose: () => void;
}

export function VariableDropMenu({
  varName,
  position,
  isInsideStage = false,
  onSelect,
  onClose,
}: VariableDropMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  if (!position) return null;

  return (
    <div
      ref={containerRef}
      style={{ top: position.y, left: position.x }}
      className="fixed z-50 w-52 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      <div className="px-2 py-1 mb-1 border-b border-border/50 flex items-center justify-between gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <div className="flex items-center gap-1.5 min-w-0">
          <Variable className="h-3 w-3 text-cyan-500 shrink-0" />
          <span className="truncate font-mono">{varName}</span>
        </div>
        {isInsideStage && (
          <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-400 font-normal border border-amber-500/20">
            In Stage
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => onSelect("Get")}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-violet-500/10 hover:text-violet-400 transition-colors cursor-pointer"
      >
        <Pill className="h-3.5 w-3.5 text-violet-400 shrink-0" />
        <div className="flex items-center justify-between w-full">
          <span className="font-medium">Get</span>
          <span className="text-[10px] text-muted-foreground font-mono">Capsule</span>
        </div>
      </button>

      {isInsideStage ? (
        <div
          title="Set Variable must be placed in Core (Root Canvas), not inside a Stage."
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground/40 cursor-not-allowed select-none bg-muted/20"
        >
          <Ban className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
          <div className="flex items-center justify-between w-full">
            <span className="font-medium line-through">Set</span>
            <span className="text-[10px] text-amber-500/70 font-mono">Core only</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onSelect("Set")}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-sky-500/10 hover:text-sky-400 transition-colors cursor-pointer"
        >
          <Zap className="h-3.5 w-3.5 text-sky-400 shrink-0" />
          <div className="flex items-center justify-between w-full">
            <span className="font-medium">Set</span>
            <span className="text-[10px] text-muted-foreground font-mono">Action</span>
          </div>
        </button>
      )}
    </div>
  );
}
