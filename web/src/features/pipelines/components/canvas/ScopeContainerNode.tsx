import { memo, useState, useRef, useEffect } from "react";
import { Handle, Position, NodeResizer, useEdges } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Cpu,
  Server,
  Layers,
  Trash2,
  Pencil,
  Bot,
  Activity,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRunners } from "@/features/runners/hooks/useRunners";
import { getSoftwareMetadata } from "@/features/runners/constants/dccEngines";
import { getStageKindName } from "./hooks/canvasUtils";
import type { StageKindType } from "../../hooks/usePipelineGraph";

export interface ScopeContainerNodeData extends Record<string, unknown> {
  stageId: string;
  name: string;
  kind: StageKindType;
  executorKey: string;
  targetRunnerId?: string | null;
  pipelineId: string;
}

export const ScopeContainerNode = memo(({ id, data, selected }: NodeProps) => {
  const nodeData = data as unknown as ScopeContainerNodeData;
  const kindName = getStageKindName(nodeData.kind);
  const isWorker = kindName === "Worker";
  const isServer = kindName === "Server";
  const isMacro = kindName === "Macro";

  // DCC Engine Branding
  const dccMeta = isWorker ? getSoftwareMetadata(nodeData.executorKey || "") : null;
  const brandHex = dccMeta?.brandColor;

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(nodeData.name || "Scope");
  const nameInputRef = useRef<HTMLInputElement>(null);

  const { data: runners = [] } = useRunners();

  const edges = useEdges();
  const incomingRunnerEdge = isWorker
    ? edges.find(
        (e) =>
          e.target === id &&
          (e.targetHandle?.toLowerCase() === "runner" ||
            e.targetHandle?.toLowerCase() === "runnerid" ||
            e.targetHandle?.toLowerCase() === "agentid")
      )
    : null;
  const isRunnerBound = !!incomingRunnerEdge;

  useEffect(() => {
    setTempName(nodeData.name || "Scope");
  }, [nodeData.name]);

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  const dispatchUpdate = (updatedFields: Partial<ScopeContainerNodeData>) => {
    window.dispatchEvent(
      new CustomEvent("pipeline:update-stage", {
        detail: {
          stageId: id,
          ...updatedFields,
        },
      })
    );
  };

  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (!trimmed || trimmed === nodeData.name) {
      setIsEditingName(false);
      setTempName(nodeData.name);
      return;
    }
    setIsEditingName(false);
    dispatchUpdate({ name: trimmed });
  };

  const handleDelete = () => {
    window.dispatchEvent(
      new CustomEvent("pipeline:delete-stage", {
        detail: { stageId: id },
      })
    );
  };

  const handleRunnerChange = (runnerId: string | null) => {
    dispatchUpdate({ targetRunnerId: runnerId === "auto" ? null : runnerId });
  };

  // Border & background themes tailored per scope type
  const theme = isWorker
    ? {
        border: selected ? "border-amber-500 shadow-amber-500/20" : "border-amber-500/40 hover:border-amber-500/70",
        headerBg: "bg-amber-500/10 border-amber-500/20 text-amber-500",
        badgeBg: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        bodyBg: "bg-amber-950/[0.03] dark:bg-amber-950/[0.07]",
        accent: "text-amber-500",
      }
    : isServer
    ? {
        border: selected ? "border-sky-500 shadow-sky-500/20" : "border-sky-500/40 hover:border-sky-500/70",
        headerBg: "bg-sky-500/10 border-sky-500/20 text-sky-500",
        badgeBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
        bodyBg: "bg-sky-950/[0.03] dark:bg-sky-950/[0.07]",
        accent: "text-sky-500",
      }
    : {
        border: selected ? "border-teal-500 shadow-teal-500/20" : "border-teal-500/40 hover:border-teal-500/70",
        headerBg: "bg-teal-500/10 border-teal-500/20 text-teal-500",
        badgeBg: "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30",
        bodyBg: "bg-teal-950/[0.03] dark:bg-teal-950/[0.07]",
        accent: "text-teal-500",
      };

  return (
    <div
      className={cn(
        "relative rounded-2xl border-2 transition-all duration-200 select-none bg-background/50",
        !brandHex && theme.border,
        theme.bodyBg,
        selected ? "shadow-xl ring-2 ring-primary/20" : "shadow-sm"
      )}
      style={{
        width: "100%",
        height: "100%",
        minWidth: 320,
        minHeight: 220,
        borderColor: brandHex ? `${brandHex}${selected ? "FF" : "66"}` : undefined,
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={320}
        minHeight={220}
        lineClassName="border-primary/60"
        handleClassName="h-2.5 w-2.5 bg-primary/90 border border-background rounded-full transition-transform hover:scale-150"
      />

      {/* Runner Data Pin Input Handle (Plug to bind Runner) */}
      {isWorker && (
        <Handle
          type="target"
          position={Position.Left}
          id="runner"
          style={{
            backgroundColor: isRunnerBound ? "#f59e0b" : "rgba(245, 158, 11, 0.25)",
            borderColor: "#f59e0b",
            borderWidth: 2,
            width: 13,
            height: 13,
            borderRadius: "50%",
            transform: "translateY(-50%)",
            left: -6.5,
            top: 24,
            zIndex: 70,
          }}
          className="!cursor-crosshair shadow-sm transition-transform hover:scale-135 hover:shadow-[0_0_8px_rgba(245,158,11,0.6)]"
          title={isRunnerBound ? "Runner dynamically bound via Wire (Plug over Select)" : "Runner Input Pin (Plug wire to bind Runner)"}
        />
      )}

      {/* Header Bar */}
      <div
        className={cn(
          "flex h-12 w-full items-center justify-between border-b px-3.5 rounded-t-[14px]",
          !brandHex && theme.headerBg
        )}
        style={brandHex ? { backgroundColor: `${brandHex}15`, borderColor: `${brandHex}33`, color: brandHex } : undefined}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/80 shadow-xs border border-border/40">
            {isWorker && dccMeta?.iconUrl ? (
              <img
                src={dccMeta.iconUrl}
                alt={dccMeta.name}
                className="h-4 w-4 object-contain"
              />
            ) : isWorker ? (
              <Cpu className="h-4 w-4 text-amber-500" />
            ) : isServer ? (
              <Server className="h-4 w-4 text-sky-500" />
            ) : (
              <Layers className="h-4 w-4 text-teal-500" />
            )}
          </div>

          {/* Name Editor */}
          {isEditingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveName();
                if (e.key === "Escape") {
                  setIsEditingName(false);
                  setTempName(nodeData.name);
                }
              }}
              onBlur={handleSaveName}
              className="h-6 rounded border border-primary/60 bg-background px-1.5 text-xs font-bold text-foreground shadow-inner outline-none w-40"
            />
          ) : (
            <div
              className="group/name flex items-center gap-1.5 cursor-pointer rounded px-1 py-0.5 hover:bg-background/40 transition-colors"
              onClick={() => setIsEditingName(true)}
              title="Click to rename stage"
            >
              <span className="font-bold text-xs text-foreground tracking-tight truncate max-w-[180px]">
                {nodeData.name || "Scope"}
              </span>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
            </div>
          )}

          {/* Scope Kind Badge */}
          <Badge
            variant="outline"
            className={cn("text-[10px] h-5 font-semibold uppercase px-1.5", !brandHex && theme.badgeBg)}
            style={brandHex ? { backgroundColor: `${brandHex}20`, borderColor: `${brandHex}40`, color: brandHex } : undefined}
          >
            {isWorker
              ? `Worker • ${dccMeta?.name || nodeData.executorKey || "DCC"}`
              : isServer
              ? "Core Services"
              : "Macro"}
          </Badge>
        </div>

        {/* Right Controls: Runner selector (Worker only) & Delete */}
        <div className="flex items-center gap-1.5 shrink-0 nodrag">
          {isWorker && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {isRunnerBound ? (
                <Badge
                  variant="outline"
                  className="h-6 px-2 text-[11px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/40 flex items-center gap-1.5 shadow-xs animate-pulse"
                  title="Runner is dynamically bound by incoming data wire (Plug over Select)"
                >
                  <Link2 className="size-3 text-amber-500 shrink-0" />
                  <span className="font-semibold tracking-tight">Bound via Wire</span>
                </Badge>
              ) : (
                <>
                  <Bot className="h-3.5 w-3.5 text-amber-500" />
                  <Select
                    selectedKey={nodeData.targetRunnerId || "auto"}
                    onSelectionChange={(key) => handleRunnerChange(String(key))}
                    aria-label="Target Runner"
                  >
                    <SelectTrigger size="sm" className="h-6 text-[11px] px-2 min-w-[120px] max-w-[160px] bg-background/80 border-amber-500/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent placement="bottom end">
                      <SelectItem id="auto" textValue="Auto Any Runner">
                        <span className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                          <Activity className="size-3" /> Auto Any Runner
                        </span>
                      </SelectItem>
                      {runners.map((r) => (
                        <SelectItem key={r.id} id={r.id} textValue={r.name || r.machineKey}>
                          <span className="truncate">{r.name || r.machineKey}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onPress={handleDelete}
            aria-label="Delete this Stage box"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Scope Backdrop Area (Where child nodes live) */}
      <div className="p-3 text-[10px] font-mono text-muted-foreground/50 tracking-wider pointer-events-none">
        {isWorker
          ? `DCC WORKSPACE • ${dccMeta?.name?.toUpperCase() || "ISOLATED"} TOOL SESSION`
          : isServer
          ? "CORE SERVICES • SYSTEM & DATA PROCESSING"
          : isMacro
          ? "MACRO STAGE • ORCHESTRATION & CONTROL FLOW"
          : "STAGE SCOPE"}
      </div>
    </div>
  );
});

ScopeContainerNode.displayName = "ScopeContainerNode";
