import { useNodeDefinition } from "./NodeDefinitions";
import { useMemo, memo, useEffect } from "react";
import type { Node } from "@xyflow/react";
import { useForm } from "react-hook-form";
import type { CustomPipelineNodeData } from "./nodes/types";
import { getPinVisual } from "./nodes/types";
import { PipelineStartNodeInspector } from "./PipelineStartNodeInspector";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Trash2,
  X,
  Link,
  Sliders,
  Box,
  FileCode,
  PlayCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FormRenderer } from "@/components/dynamic-form/FormRenderer";
import { pipelineRegistry } from "../../form-scope/pipelineRegistry";
import { usePipelineFormScope } from "../../form-scope/PipelineFormScope";
import { pinToFieldDefinition } from "../../form-scope/pinToFieldDefinition";
import { useGetStructCatalogue } from "@/gen/endpoints/pipelines/pipelines";

interface NodeConfigInspectorProps {
  pipelineId?: string;
  node: Node | null;
  triggerType?: number | string;
  triggerConfig?: any;
  onClose: () => void;
  onUpdateConfig: (nodeId: string, pinId: string, value: any) => void;
  onDeleteNode: (nodeId: string) => void;
  isReadOnly?: boolean;
}

export const NodeConfigInspector = memo(function NodeConfigInspector({
  pipelineId = "",
  node,
  triggerType = 0,
  triggerConfig = null,
  onClose,
  onUpdateConfig,
  onDeleteNode,
  isReadOnly = false,
}: NodeConfigInspectorProps) {
  const { edges = [], nodes = [], projectId = "" } = usePipelineFormScope();
  const { data: structCatalogue = [] } = useGetStructCatalogue({ projectId });

  const data = (node?.data as unknown as CustomPipelineNodeData) || {};
  const definition = useNodeDefinition(data.kind, data.refId);
  const refIdLower = String(data.refId || "").toLowerCase();
  const kindLower = String(data.kind || "").toLowerCase();
  const labelLower = String(data.label || "").toLowerCase();

  const isPipelineInputNode =
    refIdLower === "pipelineinput" ||
    refIdLower === "pipelineinputs" ||
    refIdLower === "start" ||
    refIdLower === "beginexecute" ||
    kindLower === "start" ||
    kindLower === "entry" ||
    kindLower === "pipelineinput" ||
    labelLower === "start" ||
    labelLower === "pipeline inputs" ||
    labelLower === "pipeline input" ||
    labelLower === "on resource created" ||
    labelLower === "on resource version updated";


  const inputs = data.inputs || [];
  const configValues = data.configValues || {};

  // Form Management with React Hook Form
  const form = useForm({
    defaultValues: configValues,
  });

  useEffect(() => {
    if (JSON.stringify(form.getValues()) !== JSON.stringify(configValues)) {
      form.reset(configValues);
    }
  }, [node?.id, configValues, form]);

  useEffect(() => {
    const subscription = form.watch((values, { name, type }) => {
      if (name && node && type !== undefined) {
        onUpdateConfig(node.id, name, values[name]);
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [form, node?.id, onUpdateConfig]);

  // Find incoming wired edges
  const wiredInputPinIds = useMemo(() => {
    if (!node) return new Map<string, { sourceNodeLabel: string; sourcePin: string }>();
    const map = new Map<string, { sourceNodeLabel: string; sourcePin: string }>();
    edges.forEach((e) => {
      if (e.target === node.id && e.targetHandle) {
        const sourceNode = nodes.find((n) => n.id === e.source);
        const sourceData = sourceNode?.data as unknown as CustomPipelineNodeData;
        map.set(e.targetHandle, {
          sourceNodeLabel: sourceData?.label || e.source,
          sourcePin: e.sourceHandle || "output",
        });
      }
    });
    return map;
  }, [node, edges, nodes]);

  // Filter out pure Exec pins (PinKind.Exec = 1, PinKind.Data = 0)
  const configurableInputs = useMemo(() => {
    return inputs.filter((p) => {
      const k = p.kind !== undefined ? String(p.kind).toLowerCase() : "";
      const idLower = (p.id || "").toLowerCase();
      const labelLower = (p.label || "").toLowerCase();
      const isExec =
        k === "1" ||
        k === "exec" ||
        idLower === "exec" ||
        idLower === "exec_in" ||
        idLower === "exec_out" ||
        labelLower === "exec";
      return !isExec;
    });
  }, [inputs]);

  // Split wired vs unwired inputs
  const wiredInputs = useMemo(() => {
    return configurableInputs.filter((p) => wiredInputPinIds.has(p.id || ""));
  }, [configurableInputs, wiredInputPinIds]);

  const unwiredInputs = useMemo(() => {
    return configurableInputs.filter((p) => !wiredInputPinIds.has(p.id || ""));
  }, [configurableInputs, wiredInputPinIds]);

  // Map unwired inputs to dynamic form fields via Pure Adapter
  const formFields = useMemo(() => {
    return unwiredInputs.map((pin) => {
      const field = pinToFieldDefinition(pin, configValues);
      return field.type === "pin:assetUpload"
        ? { ...field, properties: { ...field.properties, persistAsLink: true, fileAsset: data.fileAssets?.[pin.id!] } }
        : field;
    });
  }, [unwiredInputs, configValues, data.fileAssets]);

  if (!node) return null;

  return (
    <div className="absolute right-4 top-20 bottom-4 w-96 rounded-2xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl flex flex-col z-30 overflow-hidden animate-in fade-in slide-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={cn(
              "p-2 rounded-xl border flex items-center justify-center shadow-sm",
              isPipelineInputNode
                ? "bg-primary/10 border-primary/20 text-primary"
                : "bg-sky-500/10 border-sky-500/20 text-sky-500"
            )}
          >
            {isPipelineInputNode ? (
              <PlayCircle className="h-4 w-4" />
            ) : data.executor === "System" ? (
              <Box className="h-4 w-4" />
            ) : (
              <FileCode className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <h3
              className="text-sm font-semibold text-foreground truncate"
              title={data.label || node.id}
            >
              {data.label || "Node Properties"}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge
                variant="outline"
                className="text-[10px] font-mono px-1.5 py-0 h-4 border-border/60"
              >
                {data.kind || "Custom"}
              </Badge>
              {data.executor && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                  {data.executor}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isReadOnly && (
            <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-500 text-[10px] gap-1 px-1.5 py-0 font-medium">
              Read-Only
            </Badge>
          )}
          {!isPipelineInputNode && !isReadOnly && (
            <button
              type="button"
              onClick={() => onDeleteNode(node.id)}
              className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete node"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors"
            title="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body Content */}
      <ScrollArea className="flex-1 p-4">
        {isPipelineInputNode ? (
          <PipelineStartNodeInspector
            pipelineId={pipelineId}
            projectId={projectId}
            triggerType={triggerType}
            triggerConfig={triggerConfig}
          />
        ) : (
          <div className="space-y-4">
            {/* Live / Persisted Execution Outputs */}
            {data.executionOutputs && Object.keys(data.executionOutputs).length > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-1.5 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Execution Outputs</span>
                </div>
                <div className="bg-background/80 rounded-lg p-2 font-mono text-[11px] max-h-48 overflow-auto border border-border/50">
                  <pre className="whitespace-pre-wrap break-all text-muted-foreground">
                    {JSON.stringify(data.executionOutputs, null, 2)}
                  </pre>
                </div>
              </div>
            )}
            {/* Capability-driven Rule Notes */}
            {definition?.capabilities?.ruleNotes && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground">
                <span className="font-semibold text-primary block mb-0.5">Note:</span>
                {definition?.capabilities.ruleNotes}
              </div>
            )}

            {/* StructSelector: BreakStruct / MakeStruct / CastToStruct Configuration */}
            {(definition?.capabilities?.inspectorMode === "StructSelector" ||
              refIdLower === "breakstruct" ||
              refIdLower === "makestruct" ||
              refIdLower === "casttostruct") && (() => {
              const currentStructType = configValues["StructType"] || "Resource";
              const selectedStruct = structCatalogue.find(
                (s) => s.structType?.toLowerCase() === String(currentStructType).toLowerCase()
              );

              return (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 space-y-2.5 shadow-sm">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400">
                    <Box className="h-3.5 w-3.5" />
                    <span>Struct Type</span>
                  </div>
                  <Select
                    selectedKey={currentStructType}
                    onSelectionChange={(key) => onUpdateConfig(node.id, "StructType", String(key))}
                    className="w-full"
                  >
                    <SelectTrigger className="h-8 w-full text-xs font-medium border-sky-500/40">
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
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Selecting a struct type dynamically updates{" "}
                    {refIdLower === "makestruct" ? "input" : "output"} pins to match the entity schema.
                  </p>

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
            })()}

            {/* Input Properties Section */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Sliders className="h-3.5 w-3.5 text-primary" />
              <span>Input Properties</span>
            </div>

            {configurableInputs.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground italic">
                This node has no configurable inputs.
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Wired Inputs (Connected to upstream pins) */}
                {wiredInputs.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Connected Inputs ({wiredInputs.length})
                    </span>
                    {wiredInputs.map((pin) => {
                      const pinId = pin.id || "";
                      const wiredInfo = wiredInputPinIds.get(pinId);
                      const visual = getPinVisual(pin.primitiveType);

                      return (
                        <div
                          key={pinId}
                          className="rounded-lg border border-sky-500/30 bg-sky-500/5 dark:bg-sky-500/10 p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-foreground truncate">
                              {pin.label || pinId}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn("text-[9px] font-mono px-1.5 h-4 font-semibold", visual.textClass)}
                            >
                              {visual.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-sky-600 dark:text-sky-400 bg-sky-500/10 rounded-md p-2 font-mono">
                            <Link className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">
                              Connected from{" "}
                              <strong className="text-foreground">{wiredInfo?.sourceNodeLabel}</strong> (
                              {wiredInfo?.sourcePin})
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 2. Unwired Inputs (Editable Form via Scoped Registry) */}
                {unwiredInputs.length > 0 && (
                  <div className="space-y-2">
                    {wiredInputs.length > 0 && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Configurable Fields
                      </span>
                    )}
                    <div className="rounded-xl border border-border/70 bg-card p-3 shadow-sm">
                      <FormRenderer
                        key={node.id}
                        registry={pipelineRegistry}
                        control={form.control}
                        fields={formFields}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}, (prev, next) => {
  if (prev.node?.id !== next.node?.id) return false;
  if (prev.node?.data !== next.node?.data) return false;
  if (prev.triggerType !== next.triggerType) return false;
  if (prev.triggerConfig !== next.triggerConfig) return false;
  if (prev.pipelineId !== next.pipelineId) return false;
  if (prev.isReadOnly !== next.isReadOnly) return false;
  return true; // Ignore node.position changes!
});

NodeConfigInspector.displayName = "NodeConfigInspector";
