import React, { type MouseEvent } from "react";
import type { PipelineFileAssetDto, PinDefinition } from "@/gen/model";
import { Plus } from "lucide-react";
import { PinInputRow, PinOutputRow } from "./PinRow";

export interface DataPinColumnsProps {
  dataInputs: PinDefinition[];
  dataOutputs: PinDefinition[];
  fileAssets?: Record<string, PipelineFileAssetDto> | null;
  configValues?: Record<string, unknown> | null;
  protectedPinIds?: readonly unknown[] | null;
  canRemovePin?: boolean;
  canAddPin?: boolean;
  addPinLabel?: string;
  onRemovePin?: (e: MouseEvent, pinId: string) => void;
  onAddPin?: (e: MouseEvent) => void;
  renderInputFooter?: () => React.ReactNode;
}

export function DataPinColumns({
  dataInputs,
  dataOutputs,
  configValues,
  fileAssets,
  protectedPinIds,
  canRemovePin = false,
  canAddPin = false,
  addPinLabel = "Add Pin",
  onRemovePin,
  onAddPin,
  renderInputFooter,
}: DataPinColumnsProps) {
  if (dataInputs.length === 0 && dataOutputs.length === 0 && !canAddPin && !renderInputFooter) {
    return null;
  }

  const protectedSet = new Set(protectedPinIds?.map(String) ?? []);

  return (
    <div className="p-3 text-xs">
      <div className="flex justify-between gap-6">
        {/* Left Column: Inputs */}
        <div className="flex-1 space-y-2.5">
          {dataInputs.map((pin, idx) => {
            const pinId = pin.id || `in_${idx}`;
            const hasConfig = configValues?.[pinId] !== undefined;
            const isProtected = protectedSet.has(pinId);
            const allowRemove = canRemovePin && !isProtected;

            return (
              <PinInputRow
                key={pinId}
                pin={pin}
                pinId={pinId}
                hasConfig={hasConfig}
                isUnbound={fileAssets?.[pinId]?.status === "Unbound" || (typeof configValues?.[pinId] === "object" && configValues[pinId] !== null && (configValues[pinId] as { status?: string }).status === "unbound")}
                canRemove={allowRemove}
                onRemove={onRemovePin}
              />
            );
          })}

          {canAddPin && onAddPin && (
            <button
              type="button"
              onClick={onAddPin}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded transition-colors mt-1"
              title={addPinLabel}
            >
              <Plus className="h-3 w-3" />
              <span>{addPinLabel}</span>
            </button>
          )}

          {renderInputFooter?.()}
        </div>

        {/* Right Column: Outputs */}
        <div className="flex-1 space-y-2.5 text-right">
          {dataOutputs.map((pin, idx) => {
            const pinId = pin.id || `out_${idx}`;
            return <PinOutputRow key={pinId} pin={pin} pinId={pinId} />;
          })}
        </div>
      </div>
    </div>
  );
}
