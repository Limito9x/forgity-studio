import { useState, useMemo, useEffect } from "react";
import type { Node, Edge } from "@xyflow/react";
import { useForm } from "react-hook-form";
import { useGetRunners } from "@/gen/endpoints/runners/runners";
import type { RunnerDto } from "@/gen/model";
import { useRunPipeline, usePipelineInputSchema } from "../hooks/usePipelineGraph";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Play, Server, Loader2, AlertCircle, Sparkles, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { buildDynamicSchema } from "@/lib/schema-builder";
import { FormRenderer } from "@/components/dynamic-form/FormRenderer";
import { pipelineRegistry } from "../form-scope/pipelineRegistry";
import {
  pinToFieldDefinition,
  pipelineInputToFieldDefinition,
} from "../form-scope/pinToFieldDefinition";

export interface MissingRuntimeInput {
  nodeId: string;
  nodeLabel: string;
  pinId: string;
  pinLabel: string;
  primitiveType: any;
  metadata?: any;
}

interface RunPipelineModalProps {
  pipelineId: string;
  pipelineName: string;
  projectId?: string;
  nodes?: Node[];
  edges?: Edge[];
  isOpen: boolean;
  onClose: () => void;
  onExecutionStarted?: (executionId: string) => void;
}

export function RunPipelineModal({
  pipelineId,
  pipelineName,
  nodes = [],
  edges = [],
  isOpen,
  onClose,
  onExecutionStarted,
}: RunPipelineModalProps) {
  const { data: agents = [], isLoading: isLoadingAgents } = useGetRunners();
  const { data: schemaInputs = [], isLoading: isLoadingSchema } = usePipelineInputSchema(pipelineId);

  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const runMutation = useRunPipeline(pipelineId);

  // Auto-select active or first agent
  useEffect(() => {
    if (agents && agents.length > 0 && !selectedAgentId) {
      const active = agents.find((a: any) => a.isOnline || a.isActive || a.status === "Active" || a.status === 1);
      setSelectedAgentId(active?.id || agents[0].id);
    }
  }, [agents, selectedAgentId]);

  // Compute unwired & unconfigured required inputs on internal nodes (excluding Start node)
  const additionalMissingInputs = useMemo<MissingRuntimeInput[]>(() => {
    const list: MissingRuntimeInput[] = [];
    for (const node of nodes) {
      const nodeData = node.data as any;
      if (nodeData?.kind === "Start" || nodeData?.refId === "BeginExecute") {
        continue;
      }

      const inputs = nodeData?.inputs || [];
      const configValues = nodeData?.configValues || {};
      for (const pin of inputs) {
        // Skip Exec Pins
        if (pin.kind === 1 || (pin.kind as any) === "Exec" || pin.id === "exec_in" || pin.id === "exec_out") {
          continue;
        }

        if (pin.isRequired) {
          const pinId = pin.id;
          const isConnected = edges.some((e) => e.target === node.id && e.targetHandle === pinId);
          const hasConfig =
            (configValues[pinId] !== undefined && configValues[pinId] !== null && configValues[pinId] !== "") ||
            (pin.defaultValue !== undefined && pin.defaultValue !== null && pin.defaultValue !== "");

          if (!isConnected && !hasConfig) {
            list.push({
              nodeId: node.id,
              nodeLabel: nodeData.label || node.id,
              pinId: pinId,
              pinLabel: pin.label || pinId,
              primitiveType: pin.primitiveType,
              metadata: pin.metadata,
            });
          }
        }
      }
    }
    return list;
  }, [nodes, edges]);

  // Convert schema inputs (Start Node) to FieldDefinition[]
  const startFields = useMemo(() => {
    return schemaInputs.map((input) => pipelineInputToFieldDefinition(input));
  }, [schemaInputs]);

  // Convert missing unwired inputs to FieldDefinition[]
  const missingFields = useMemo(() => {
    return additionalMissingInputs.map((input) =>
      pinToFieldDefinition(
        {
          id: input.pinId,
          label: input.pinLabel,
          primitiveType: input.primitiveType,
          isRequired: true,
          metadata: input.metadata,
        },
        {},
        {
          name: `${input.nodeId}.${input.pinId}`,
          label: `${input.nodeLabel} → ${input.pinLabel}`,
        }
      )
    );
  }, [additionalMissingInputs]);

  // Aggregate all fields for schema validation
  const allFields = useMemo(
    () => [...startFields, ...missingFields],
    [startFields, missingFields]
  );

  const validationSchema = useMemo(
    () => buildDynamicSchema(allFields, pipelineRegistry),
    [allFields]
  );

  // Initial default values for all inputs
  const defaultValues = useMemo(() => {
    const defaults: Record<string, any> = {};
    const KNOWN_PLACEHOLDERS = [
      "resource",
      "workspace",
      "contenttype",
      "agent",
      "tag",
      "taggroup",
      "variable",
      "none",
    ];

    schemaInputs.forEach((input) => {
      const f = startFields.find((field) => field.name === input.key);
      const val = f?.defaultValue !== undefined ? f.defaultValue : input.defaultValue;
      const valStr = typeof val === "string" ? val.trim().toLowerCase() : "";

      // Nếu defaultValue trùng với tên Entity Target placeholder thì coi là chưa chọn (rỗng)
      if (val === null || val === undefined || KNOWN_PLACEHOLDERS.includes(valStr)) {
        defaults[input.key] = f?.properties?.multiple ? [] : "";
      } else {
        defaults[input.key] = val;
      }
    });

    additionalMissingInputs.forEach((input) => {
      defaults[`${input.nodeId}.${input.pinId}`] = "";
    });

    return defaults;
  }, [schemaInputs, startFields, additionalMissingInputs]);

  const form = useForm<any>({
    resolver: zodResolver(validationSchema as any),
    defaultValues,
    values: defaultValues,
    mode: "onSubmit",
  });

  const isSubmitting = runMutation.isPending || form.formState.isSubmitting;

  const handleRun = form.handleSubmit(
    async (values: any) => {
      if (runMutation.isPending) return;

      const finalAgentId =
        selectedAgentId ||
        (agents.length > 0 ? agents[0].id : "00000000-0000-0000-0000-000000000001");

      // Separate start inputs vs node overrides
      const runtimeInputs: Record<string, any> = {};

      schemaInputs.forEach((input) => {
        if (values[input.key] !== undefined) {
          runtimeInputs[input.key] = values[input.key];
        }
      });

      additionalMissingInputs.forEach((input) => {
        const key = `${input.nodeId}.${input.pinId}`;
        if (values[key] !== undefined) {
          runtimeInputs[key] = values[key];
        }
      });

      try {
        const execution = await runMutation.mutateAsync({
          agentId: finalAgentId,
          runtimeInputs,
        });

        toast.success("Pipeline execution started!");
        onClose();
        if (execution?.id && onExecutionStarted) {
          onExecutionStarted(execution.id);
        }
      } catch (err: any) {
        const msg =
          err?.response?.data?.message || err?.message || "Failed to start pipeline execution";
        toast.error(msg);
      }
    },
    (errors: any) => {
      console.warn("Pipeline run validation errors:", errors);
      const firstError = (Object.values(errors)[0] as any)?.message;
      toast.error(
        typeof firstError === "string"
          ? firstError
          : "Please fill in all required inputs before running pipeline."
      );
    }
  );

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-[560px] p-6 gap-5"
    >
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <Play className="h-4 w-4 text-primary fill-primary" />
          <span>Run Pipeline</span>
        </DialogTitle>
        <p className="text-xs text-muted-foreground">
          Running <span className="font-semibold text-foreground">{pipelineName}</span> requires selecting an Execution Agent and specifying pipeline inputs.
        </p>
      </DialogHeader>

      <form onSubmit={handleRun} className="space-y-4">
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* 1. Pipeline Start Inputs Section (From Backend Schema) */}
          {isLoadingSchema ? (
            <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
              Loading input schema...
            </div>
          ) : schemaInputs.length > 0 ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span>Pipeline Start Inputs ({schemaInputs.length})</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Configure runtime arguments for your pipeline execution entry point.
              </p>
              <div className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
                <FormRenderer
                  registry={pipelineRegistry}
                  control={form.control}
                  fields={startFields}
                />
              </div>
            </div>
          ) : null}

          {/* 2. Additional Unwired Required Inputs */}
          {missingFields.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-3">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Additional Unconnected Inputs ({missingFields.length})</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Required inputs on internal nodes that are not connected to any wire.
              </p>
              <div className="rounded-lg border border-border/70 bg-card p-3 shadow-sm">
                <FormRenderer
                  registry={pipelineRegistry}
                  control={form.control}
                  fields={missingFields}
                />
              </div>
            </div>
          )}

          {/* 3. Select Agent Section */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Select Execution Agent</span>
            </Label>
            {isLoadingAgents ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading registered agents...
              </div>
            ) : agents.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-destructive/40 p-4 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>No agents registered. Please start an Automation-Agent worker first.</span>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {agents.map((agent: RunnerDto) => {
                  const isSelected = selectedAgentId === agent.id;
                  const isOnline = agent.isActive;

                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setSelectedAgentId(agent.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border p-2.5 text-left text-xs transition-all",
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border/70 hover:border-border hover:bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                            isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          )}
                        >
                          <Server className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <span className="block font-medium text-foreground truncate">{agent.name}</span>
                          <span className="block text-[10px] text-muted-foreground font-mono truncate">{agent.id}</span>
                        </div>
                      </div>

                      <Badge
                        variant={isOnline ? "default" : "secondary"}
                        className={cn(
                          "h-5 text-[10px] shrink-0 capitalize",
                          isOnline && "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/30"
                        )}
                      >
                        {isOnline ? "Active" : "Inactive"}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button variant="outline" size="sm" onPress={onClose} isDisabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            type="submit"
            isDisabled={!selectedAgentId || isSubmitting}
            className="gap-1.5"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Triggering...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Execute Run</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
