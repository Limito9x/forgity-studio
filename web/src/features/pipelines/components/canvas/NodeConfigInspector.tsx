import { useMemo, memo, useEffect, useState } from "react";
import type { Node } from "@xyflow/react";
import { useForm } from "react-hook-form";
import { Sliders, CheckCircle2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FormRenderer } from "@/components/dynamic-form/FormRenderer";
import { useNodeDefinition } from "./NodeDefinitions";
import { nodeView } from "../../nodeDefinitions";
import type { CustomPipelineNodeData } from "./nodes/types";
import { PipelineStartNodeInspector } from "./PipelineStartNodeInspector";
import { pipelineRegistry } from "../../form-scope/pipelineRegistry";
import { usePipelineFormScope, useNodeDiagnostics } from "../../form-scope/PipelineFormScope";
import { pinToFieldDefinition } from "../../form-scope/pinToFieldDefinition";
import { useGetStructCatalogue } from "@/gen/endpoints/pipelines/pipelines";
import { NodeConfigHeader } from "./inspector/NodeConfigHeader";
import { NodeConfigDiagnosticsBanner } from "./inspector/NodeConfigDiagnosticsBanner";
import { NodeConfigStructSelector } from "./inspector/NodeConfigStructSelector";
import { NodeConfigModeSelector } from "./inspector/NodeConfigModeSelector";
import { NodeConfigWiredInputs } from "./inspector/NodeConfigWiredInputs";
import { useCustomNodeSource } from "../../hooks/useCustomNodeSource";
import { InspectScriptCodeDialog } from "../../dialogs/InspectScriptCodeDialog";

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
  const { nodeDiagnostics, errorCount, warningCount, hasErrors, getPinDiagnostics } =
    useNodeDiagnostics(node?.id);

  const data = (node?.data as unknown as CustomPipelineNodeData) || {};
  const definition = useNodeDefinition(data.kind, data.refId);

  const [isSourceDialogOpen, setIsSourceDialogOpen] = useState(false);
  const isCustomNode = Boolean(definition?.id) && (data.kind === "Custom" || definition?.source === "Custom");
  const { data: sourceData } = useCustomNodeSource(definition?.id, isSourceDialogOpen);

  // Contract-driven check: No hardcoded title/string guessing
  const isLifecycleEntry =
    data.kind === "Start" ||
    data.refId === "Start" ||
    nodeView(data.kind, definition) === "Start";

  const isStructSelector = definition?.capabilities?.inspectorMode === "StructSelector";
  const hasModeSelector = (definition?.capabilities?.schemaConfigKeys || []).some(
    (k) => String(k).toLowerCase() === "mode"
  );

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

  // Filter out pure Exec pins and StructType when rendered via StructSelector
  const configurableInputs = useMemo(() => {
    return inputs.filter((p) => {
      const k = p.kind !== undefined ? String(p.kind).toLowerCase() : "";
      const isExec = k === "1" || k === "exec" || p.id === "exec" || p.id === "Exec";
      if (isExec) return false;
      if (isStructSelector && p.id === "StructType") return false;
      if (hasModeSelector && p.id?.toLowerCase() === "mode") return false;
      return true;
    });
  }, [inputs, isStructSelector, hasModeSelector]);

  // Split wired vs unwired inputs
  const wiredInputs = useMemo(() => {
    return configurableInputs.filter((p) => wiredInputPinIds.has(p.id || ""));
  }, [configurableInputs, wiredInputPinIds]);

  const unwiredInputs = useMemo(() => {
    return configurableInputs.filter((p) => !wiredInputPinIds.has(p.id || ""));
  }, [configurableInputs, wiredInputPinIds]);

  // Map unwired inputs to dynamic form fields via Pure Strategy Adapter
  const formFields = useMemo(() => {
    return unwiredInputs.map((pin) => {
      const field = pinToFieldDefinition(pin, configValues);
      return field.type === "pin:assetUpload"
        ? {
            ...field,
            properties: {
              ...field.properties,
              persistAsLink: true,
              fileAsset: data.fileAssets?.[pin.id!],
            },
          }
        : field;
    });
  }, [unwiredInputs, configValues, data.fileAssets]);

  if (!node) return null;

  return (
    <div className="absolute right-4 top-20 bottom-4 w-96 rounded-2xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl flex flex-col z-30 overflow-hidden animate-in fade-in slide-from-right-4 duration-200">
      {/* Header */}
      <NodeConfigHeader
        label={data.label || "Node Properties"}
        kind={data.kind}
        executor={data.executor}
        isLifecycleEntry={isLifecycleEntry}
        isReadOnly={isReadOnly}
        canViewSource={isCustomNode}
        onViewSource={() => setIsSourceDialogOpen(true)}
        onDelete={() => onDeleteNode(node.id)}
        onClose={onClose}
      />

      {/* Body Content */}
      <ScrollArea className="flex-1 p-4">
        {isLifecycleEntry ? (
          <PipelineStartNodeInspector
            pipelineId={pipelineId}
            projectId={projectId}
            triggerType={triggerType}
            triggerConfig={triggerConfig}
          />
        ) : (
          <div className="space-y-4">
            {/* Build-Time Diagnostics Warning & Error Panel */}
            <NodeConfigDiagnosticsBanner
              diagnostics={nodeDiagnostics}
              errorCount={errorCount}
              warningCount={warningCount}
              hasErrors={hasErrors}
            />

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

            {/* Capability-driven StructSelector Configuration */}
            {isStructSelector && (
              <NodeConfigStructSelector
                currentStructType={String(configValues["StructType"] || "").trim()}
                structCatalogue={structCatalogue}
                onSelectStruct={(structType) => onUpdateConfig(node.id, "StructType", structType)}
              />
            )}

            {/* Capability-driven ModeSelector Configuration */}
            {hasModeSelector && (
              <NodeConfigModeSelector
                currentMode={String(configValues["Mode"] || "").trim()}
                refId={data.refId}
                onSelectMode={(mode) => onUpdateConfig(node.id, "Mode", mode)}
              />
            )}

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
                <NodeConfigWiredInputs
                  wiredInputs={wiredInputs}
                  wiredInputPinIds={wiredInputPinIds}
                  getPinDiagnostics={getPinDiagnostics}
                />

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

      {/* Script Source Inspection Dialog */}
      {isCustomNode && (
        <InspectScriptCodeDialog
          isOpen={isSourceDialogOpen}
          onClose={() => setIsSourceDialogOpen(false)}
          fileName={sourceData?.fileName || `${data.label || data.refId || "script"}.py`}
          executor={sourceData?.executor || data.executor || "Python"}
          scriptContent={sourceData?.content}
        />
      )}
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
