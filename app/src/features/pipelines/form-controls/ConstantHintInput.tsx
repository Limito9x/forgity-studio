import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePipelineWorkspaceOptional } from "../context/PipelineWorkspaceContext";
import { extractConstantsMap, resolveConstants } from "../utils/resolveConstants";

export interface ConstantHintInputProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Input>, "onChange" | "value"> {
  value?: string;
  onValueChange?: (value: string) => void;
}

/**
 * Input with `${...}` workspace constant autocomplete hint popover.
 */
export function ConstantHintInput({
  value = "",
  onValueChange,
  className,
  onKeyDown,
  onBlur,
  ...rest
}: ConstantHintInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const workspace = usePipelineWorkspaceOptional();
  const paletteItems = (workspace as any)?.paletteItems ?? [];
  const constantsMap = useMemo(
    () => extractConstantsMap(paletteItems),
    [paletteItems]
  );

  const [triggerRange, setTriggerRange] = useState<{ start: number; end: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => {
    if (!triggerRange) return [];
    const q = triggerRange.query.toLowerCase();
    return Object.entries(constantsMap)
      .filter(([key]) => !q || key.toLowerCase().includes(q))
      .map(([key, rawVal]) => ({
        key,
        rawVal,
        resolvedVal: resolveConstants(rawVal, constantsMap),
      }))
      .slice(0, 12);
  }, [constantsMap, triggerRange]);

  const updateTriggerFromElement = (el: HTMLInputElement | null, nextValue: string) => {
    if (!el) {
      setTriggerRange(null);
      return;
    }
    const cursor = el.selectionStart ?? nextValue.length;
    const beforeCursor = nextValue.slice(0, cursor);
    const match = /\$\{([A-Za-z0-9_]*)$/.exec(beforeCursor);
    if (!match) {
      setTriggerRange(null);
      return;
    }
    setTriggerRange({
      start: cursor - match[0].length,
      end: cursor,
      query: match[1] ?? "",
    });
    setActiveIndex(0);
  };

  const applySuggestion = (key: string) => {
    if (!triggerRange) return;
    const current = value ?? "";
    const insertion = `\${${key}}`;
    const next = current.slice(0, triggerRange.start) + insertion + current.slice(triggerRange.end);
    onValueChange?.(next);
    const nextCursor = triggerRange.start + insertion.length;
    setTriggerRange(null);
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(nextCursor, nextCursor);
      }
    });
  };

  return (
    <div className="relative flex-1 min-w-0">
      <Input
        {...rest}
        ref={inputRef}
        value={value}
        className={className}
        onChange={(e) => {
          const nextVal = e.target.value;
          onValueChange?.(nextVal);
          updateTriggerFromElement(e.currentTarget, nextVal);
        }}
        onClick={(e) => updateTriggerFromElement(e.currentTarget, value)}
        onKeyUp={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Enter" && e.key !== "Escape") {
            updateTriggerFromElement(e.currentTarget, value);
          }
        }}
        onKeyDown={(e) => {
          if (triggerRange && suggestions.length > 0) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((prev) => (prev + 1) % suggestions.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
              return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
              e.preventDefault();
              const chosen = suggestions[activeIndex] ?? suggestions[0];
              if (chosen) applySuggestion(chosen.key);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setTriggerRange(null);
              return;
            }
          }
          onKeyDown?.(e);
        }}
        onBlur={(e) => {
          setTimeout(() => setTriggerRange(null), 120);
          onBlur?.(e);
        }}
      />

      {triggerRange && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-48 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md p-1">
          {suggestions.map((item, idx) => (
            <button
              key={item.key}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySuggestion(item.key)}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded-sm text-xs flex flex-col gap-0.5 transition-colors",
                idx === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
              )}
            >
              <span className="font-mono font-semibold text-[11px]">{`\${${item.key}}`}</span>
              <span className="font-mono text-[10px] text-muted-foreground truncate">
                {item.resolvedVal || "(empty)"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
