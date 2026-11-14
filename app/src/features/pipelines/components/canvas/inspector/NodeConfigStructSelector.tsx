import { memo } from "react";
import { Box, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { StructDefinitionDto } from "@/gen/model";

interface NodeConfigStructSelectorProps {
  currentStructType: string;
  structCatalogue: StructDefinitionDto[];
  onSelectStruct: (structType: string) => void;
}

export const NodeConfigStructSelector = memo(function NodeConfigStructSelector({
  currentStructType,
  structCatalogue,
  onSelectStruct,
}: NodeConfigStructSelectorProps) {
  const selectedStruct = currentStructType
    ? structCatalogue.find(
        (s) => s.structType?.toLowerCase() === currentStructType.toLowerCase()
      )
    : undefined;

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 space-y-2.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400">
        <Box className="h-3.5 w-3.5" />
        <span>Struct Type</span>
      </div>
      <Select
        placeholder="Select a struct type..."
        selectedKey={currentStructType || null}
        onSelectionChange={(key) => {
          if (key != null) {
            onSelectStruct(String(key));
          }
        }}
        className="w-full"
      >
        <SelectTrigger
          className={cn(
            "h-8 w-full text-xs font-medium",
            currentStructType ? "border-sky-500/40" : "border-amber-500/50"
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {structCatalogue.map((s) => (
            <SelectItem key={s.structType} id={s.structType}>
              {s.label || s.structType}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!currentStructType ? (
        <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Please select a Struct Type to generate node pins.</span>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground leading-tight">
          Selecting a struct type dynamically updates node pins to match the entity schema.
        </p>
      )}

      {/* Live Sample JSON Preview */}
      {selectedStruct?.sampleJson != null && (
        <div className="space-y-1 pt-1 border-t border-sky-500/20">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
            <span>Sample Structure Preview</span>
            <span className="text-[9px] text-sky-500 font-normal">Live Schema</span>
          </div>
          <pre className="p-2 rounded bg-zinc-950/80 text-emerald-400 font-mono text-[10px] overflow-x-auto max-h-36 border border-zinc-800/80 select-all">
            {JSON.stringify(selectedStruct.sampleJson, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
});
