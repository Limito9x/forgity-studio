import { useState } from "react";
import { Tag, Sparkles, Cpu, Info, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { PinCardList } from "../../node-editor/PinCardList";
import { PinConfigInspector } from "../../node-editor/PinConfigInspector";
import type { AnalyzedCustomNodeDto, PinDefinition } from "@/gen/model";
import { PinPrimitiveType } from "@/gen/model/pinPrimitiveType";
import { PinCardinality } from "@/gen/model/pinCardinality";

interface VisualPinMapperTabProps {
  node: AnalyzedCustomNodeDto;
  onUpdateNode: (updates: Partial<AnalyzedCustomNodeDto>) => void;
}

export function VisualPinMapperTab({
  node,
  onUpdateNode,
}: VisualPinMapperTabProps) {
  const [selectedPin, setSelectedPin] = useState<{
    pin: PinDefinition;
    direction: "in" | "out";
    index: number;
  } | null>(null);

  const inputs = (node.inputs ?? []) as PinDefinition[];
  const outputs = (node.outputs ?? []) as PinDefinition[];

  const inputDiffs = node.inputPinDiffs ?? [];
  const outputDiffs = node.outputPinDiffs ?? [];
  const hasDiffs = inputDiffs.length > 0 || outputDiffs.length > 0;

  // Pin Handlers
  const handleAddInput = () => {
    const newPin: PinDefinition = {
      id: `param_${inputs.length + 1}`,
      label: `Param ${inputs.length + 1}`,
      primitiveType: PinPrimitiveType.NUMBER_0,
      cardinality: PinCardinality.NUMBER_0,
      isRequired: true,
      defaultValue: null,
    };
    const newInputs = [...inputs, newPin];
    onUpdateNode({ inputs: newInputs as any });
    setSelectedPin({ pin: newPin, direction: "in", index: newInputs.length - 1 });
  };

  const handleDeleteInput = (index: number) => {
    const newInputs = inputs.filter((_, i) => i !== index);
    onUpdateNode({ inputs: newInputs as any });
    if (selectedPin?.direction === "in" && selectedPin.index === index) {
      setSelectedPin(null);
    }
  };

  const handleAddOutput = () => {
    const newPin: PinDefinition = {
      id: `output_${outputs.length + 1}`,
      label: `Output ${outputs.length + 1}`,
      primitiveType: PinPrimitiveType.NUMBER_0,
      cardinality: PinCardinality.NUMBER_0,
      isRequired: true,
    };
    const newOutputs = [...outputs, newPin];
    onUpdateNode({ outputs: newOutputs as any });
    setSelectedPin({ pin: newPin, direction: "out", index: newOutputs.length - 1 });
  };

  const handleDeleteOutput = (index: number) => {
    const newOutputs = outputs.filter((_, i) => i !== index);
    onUpdateNode({ outputs: newOutputs as any });
    if (selectedPin?.direction === "out" && selectedPin.index === index) {
      setSelectedPin(null);
    }
  };

  const handleUpdateActivePin = (updated: PinDefinition) => {
    if (!selectedPin) return;

    if (selectedPin.direction === "in") {
      const newInputs = inputs.map((p, i) => (i === selectedPin.index ? updated : p));
      onUpdateNode({ inputs: newInputs as any });
    } else {
      const newOutputs = outputs.map((p, i) => (i === selectedPin.index ? updated : p));
      onUpdateNode({ outputs: newOutputs as any });
    }

    setSelectedPin({ ...selectedPin, pin: updated });
  };

  return (
    <div className="w-full p-6 space-y-6">
      {/* Node Metadata Section */}
      <Card className="border border-border/80 shadow-xs bg-card">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Display Title */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Sparkles className="size-3.5 text-primary" />
                Display Title (Canvas Label)
              </Label>
              <Input
                placeholder="e.g. Generate UV Maps"
                value={node.suggestedLabel || ""}
                onChange={(e) => onUpdateNode({ suggestedLabel: e.target.value })}
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Title displayed on pipeline node header.</p>
            </div>

            {/* Node Identifier / Key */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Tag className="size-3.5 text-primary" />
                Node Identifier / Key <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="e.g. generate_uv_maps"
                value={node.suggestedName || node.key || ""}
                onChange={(e) => onUpdateNode({ suggestedName: e.target.value })}
                className="h-9 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">Unique identifier used for DAG resolution.</p>
            </div>

            {/* Runtime Executor */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <Cpu className="size-3.5 text-primary" />
                Runtime Executor
              </Label>
              <Select
                selectedKey={node.executor?.toLowerCase() || "blender"}
                onSelectionChange={(key) =>
                  onUpdateNode({ executor: String(key) })
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem id="blender">Blender Worker (bpy)</SelectItem>
                  <SelectItem id="unreal">Unreal Engine Worker (unreal)</SelectItem>
                  <SelectItem id="python">Native Python 3 Worker</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Target execution daemon on Runner.</p>
            </div>

            {/* Node Description */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <FileText className="size-3.5 text-primary" />
                Description
              </Label>
              <Input
                placeholder="Brief summary of what this node does..."
                value={node.description || ""}
                onChange={(e) => onUpdateNode({ description: e.target.value })}
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Optional tool documentation.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Diffs Summary Banner (if override and has changes) */}
      {hasDiffs && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <Info className="size-3.5" />
            Detected Pin Specification Changes vs Existing Version
          </div>
          <div className="flex flex-wrap gap-1.5">
            {inputDiffs.map((d, i) => (
              <Badge
                key={`in-diff-${i}`}
                variant="outline"
                className={cn(
                  "text-[10px] font-mono",
                  d.diffKind === "Added" &&
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  d.diffKind === "Removed" &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                  d.diffKind === "TypeChanged" &&
                    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}
              >
                [In] {d.diffKind === "Added" ? "+" : d.diffKind === "Removed" ? "-" : "~"}{" "}
                {d.label || d.pinId} ({d.primitiveType})
              </Badge>
            ))}
            {outputDiffs.map((d, i) => (
              <Badge
                key={`out-diff-${i}`}
                variant="outline"
                className={cn(
                  "text-[10px] font-mono",
                  d.diffKind === "Added" &&
                    "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  d.diffKind === "Removed" &&
                    "border-destructive/40 bg-destructive/10 text-destructive",
                  d.diffKind === "TypeChanged" &&
                    "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                )}
              >
                [Out] {d.diffKind === "Added" ? "+" : d.diffKind === "Removed" ? "-" : "~"}{" "}
                {d.label || d.pinId} ({d.primitiveType})
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Two-pane Master-Detail Architecture (PinCardList + PinConfigInspector) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Schema Pin Architecture
          </h3>
          <span className="text-xs text-muted-foreground">
            Click on any pin below to open its property inspector panel
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Pins Frames */}
          <div className="lg:col-span-7 space-y-4">
            <PinCardList
              inputs={inputs}
              outputs={outputs}
              selectedPin={selectedPin}
              onSelectPin={setSelectedPin}
              onAddInput={handleAddInput}
              onDeleteInput={handleDeleteInput}
              onAddOutput={handleAddOutput}
              onDeleteOutput={handleDeleteOutput}
            />
          </div>

          {/* Right Column: Pin Inspector Panel */}
          <div className="lg:col-span-5 sticky top-4">
            <PinConfigInspector
              selectedPin={selectedPin}
              onUpdatePin={handleUpdateActivePin}
              onClose={() => setSelectedPin(null)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
