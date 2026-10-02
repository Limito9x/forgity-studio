import { useEffect, useRef } from "react";
import { Pill, Zap, Variable } from "lucide-react";

interface VariableDropMenuProps {
  varName: string;
  position: { x: number; y: number } | null;
  onSelect: (action: "Get" | "Set") => void;
  onClose: () => void;
}

export function VariableDropMenu({
  varName,
  position,
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
      className="fixed z-50 w-48 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-md p-1.5 shadow-2xl animate-in fade-in zoom-in-95 duration-100 font-sans"
    >
      <div className="px-2 py-1 mb-1 border-b border-border/50 flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
        <Variable className="h-3 w-3 text-cyan-500" />
        <span className="truncate font-mono">{varName}</span>
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
    </div>
  );
}
