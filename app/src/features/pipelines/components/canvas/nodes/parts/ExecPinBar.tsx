import { Handle, Position } from "@xyflow/react";
import type { PinDefinition } from "@/gen/model";

interface ExecPinBarProps {
  showExecIn?: boolean;
  execInLabel?: string;
  execOutputs?: PinDefinition[];
  execColor?: string;
}

export function ExecPinBar({
  showExecIn = false,
  execInLabel = "Exec",
  execOutputs = [],
  execColor = "#3b82f6",
}: ExecPinBarProps) {
  if (!showExecIn && execOutputs.length === 0) return null;

  return (
    <div className="relative flex items-center justify-between px-3.5 py-1.5 bg-muted/30 border-b border-border/40 text-[11px] font-semibold text-foreground/90 select-none">
      {/* Exec In (Left) */}
      <div className="flex items-center gap-1.5 min-w-[70px]">
        {showExecIn ? (
          <div className="flex items-center gap-1">
            <Handle
              type="target"
              position={Position.Left}
              id="exec_in"
              style={{
                backgroundColor: "#ffffff",
                borderColor: execColor,
                borderWidth: 2,
                width: 14,
                height: 14,
                borderRadius: 3,
                transform: "translateY(-50%) rotate(45deg)",
                left: -7,
                top: "50%",
                zIndex: 50,
              }}
              className="!cursor-crosshair !pointer-events-auto shadow-md transition-all hover:scale-125 hover:shadow-[0_0_10px_rgba(255,255,255,0.9)]"
            />
            <span className="flex items-center gap-1 text-[11px] text-foreground font-bold tracking-wide pl-1">
              <span className="text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">▶</span> {execInLabel}
            </span>
          </div>
        ) : (
          <span />
        )}
      </div>

      {/* Exec Out (Right) */}
      <div className="flex flex-col gap-1.5 justify-end items-end min-w-[70px]">
        {execOutputs.map((execOutPin) => (
          <div key={execOutPin.id} className="relative flex items-center justify-end gap-1">
            <span className="flex items-center gap-1 text-[11px] text-foreground font-bold tracking-wide pr-1">
              {execOutPin.label || execOutPin.id}{" "}
              <span className="text-white drop-shadow-[0_0_3px_rgba(255,255,255,0.8)]">▶</span>
            </span>
            <Handle
              type="source"
              position={Position.Right}
              id={execOutPin.id}
              style={{
                backgroundColor: "#ffffff",
                borderColor: execColor,
                borderWidth: 2,
                width: 14,
                height: 14,
                borderRadius: 3,
                transform: "translateY(-50%) rotate(45deg)",
                right: -7,
                top: "50%",
                zIndex: 50,
              }}
              className="!cursor-crosshair !pointer-events-auto shadow-md transition-all hover:scale-125 hover:shadow-[0_0_10px_rgba(255,255,255,0.9)]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
