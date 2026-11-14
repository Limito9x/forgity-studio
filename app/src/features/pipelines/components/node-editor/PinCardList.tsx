import type { PinDefinition } from "@/gen/model";
import { PinCardItem } from "./PinCardItem";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Plus, ArrowDownLeft, ArrowUpRight } from "lucide-react";

interface PinCardListProps {
  inputs: PinDefinition[];
  outputs: PinDefinition[];
  selectedPin: {
    pin: PinDefinition;
    direction: "in" | "out";
    index: number;
  } | null;
  onSelectPin: (selection: { pin: PinDefinition; direction: "in" | "out"; index: number } | null) => void;
  onAddInput: () => void;
  onDeleteInput: (index: number) => void;
  onAddOutput: () => void;
  onDeleteOutput: (index: number) => void;
}

export function PinCardList({
  inputs,
  outputs,
  selectedPin,
  onSelectPin,
  onAddInput,
  onDeleteInput,
  onAddOutput,
  onDeleteOutput,
}: PinCardListProps) {
  return (
    <div className="space-y-4">
      {/* Frame 1: Input Pins */}
      <Card className="border shadow-xs bg-card">
        <CardHeader className="p-3.5 pb-2.5 flex flex-row items-center justify-between border-b space-y-0">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <ArrowDownLeft className="size-3.5" />
            </div>
            <div>
              <CardTitle className="text-xs font-bold">Input Pins ({inputs.length})</CardTitle>
              <p className="text-[10px] text-muted-foreground">Parameters passed to script</p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onPress={onAddInput}
          >
            <Plus className="size-3" /> Add Input
          </Button>
        </CardHeader>

        <CardContent className="p-3 space-y-2">
          {inputs.length === 0 ? (
            <div className="text-[11px] text-muted-foreground text-center py-6 border border-dashed rounded-lg bg-muted/5">
              No input pins detected. Upload script or click &quot;Add Input&quot; to define parameters.
            </div>
          ) : (
            <div className="space-y-2">
              {inputs.map((pin, index) => {
                const isSelected =
                  selectedPin?.direction === "in" && selectedPin.index === index;
                return (
                  <PinCardItem
                    key={index}
                    pin={pin}
                    direction="in"
                    isSelected={isSelected}
                    onSelect={() => onSelectPin({ pin, direction: "in", index })}
                    onDelete={() => onDeleteInput(index)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Frame 2: Output Pins */}
      <Card className="border shadow-xs bg-card">
        <CardHeader className="p-3.5 pb-2.5 flex flex-row items-center justify-between border-b space-y-0">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <ArrowUpRight className="size-3.5" />
            </div>
            <div>
              <CardTitle className="text-xs font-bold">Output Pins ({outputs.length})</CardTitle>
              <p className="text-[10px] text-muted-foreground">Result keys returned from script</p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onPress={onAddOutput}
          >
            <Plus className="size-3" /> Add Output
          </Button>
        </CardHeader>

        <CardContent className="p-3 space-y-2">
          {outputs.length === 0 ? (
            <div className="text-[11px] text-muted-foreground text-center py-6 border border-dashed rounded-lg bg-muted/5">
              No output pins detected. Define return dictionary keys for downstream nodes.
            </div>
          ) : (
            <div className="space-y-2">
              {outputs.map((pin, index) => {
                const isSelected =
                  selectedPin?.direction === "out" && selectedPin.index === index;
                return (
                  <PinCardItem
                    key={index}
                    pin={pin}
                    direction="out"
                    isSelected={isSelected}
                    onSelect={() => onSelectPin({ pin, direction: "out", index })}
                    onDelete={() => onDeleteOutput(index)}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
