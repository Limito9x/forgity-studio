import { useState, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Node, Edge } from "@xyflow/react";
import { useForm } from "react-hook-form";
import { useRunners } from "@/features/runners/hooks/useRunners";
import { useRunPipeline, type PipelineParameterDto } from "../hooks/usePipelineGraph";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Play,
  Loader2,
  AlertCircle,
  Sparkles,
  Server,
  AlertTriangle,
  Boxes,
  ShieldCheck,
  PackageCheck,
} from "lucide-react";
import { toast } from "sonner";
import { zodResolver } from "@hookform/resolvers/zod";
import { buildDynamicSchema } from "@/lib/schema-builder";
import { FormRenderer } from "@/components/dynamic-form/FormRenderer";
import { pipelineRegistry } from "../form-scope/pipelineRegistry";
import { PipelineFormScopeProvider } from "../form-scope/PipelineFormScope";
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
  cardinality?: any;
  structType?: string | null;
  metadata?: any;
}

interface RunPipelineModalProps {
  pipelineId: string;
  pipelineName: string;
  projectId?: string;
  nodes?: Node[];
  edges?: Edge[];
  parameters?: PipelineParameterDto[];
  isOpen: boolean;
  onClose: () => void;
  onExecutionStarted?: (executionId: string) => void;
}

export function RunPipelineModal({
  pipelineId,
  pipelineName,
  projectId = "",
  nodes = [],
  edges = [],
  parameters = [],
  isOpen,
  onClose,
  onExecutionStarted,
}: RunPipelineModalProps) {
  const { data: agents = [] } = useRunners();

  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const runMutation = useRunPipeline(pipelineId);

  // Auto-select active or first agent in background
  useEffect(() => {
    if (agents && agents.length > 0 && !selectedAgentId) {
      const active = agents.find((a: any) => a.isOnline || a.isActive || a.status === "Active" || a.status === 1);
      setSelectedAgentId(active?.id || agents[0].id);
    }
  }, [agents, selectedAgentId]);

  const requiresExternalRunner = useMemo(() => {
    return nodes.some((n: any) => {
      if (n.type === "scopeContainer") {
        const executor = n.data?.executorKey || n.data?.executor;
        return executor && !["builtin", "dotnet", "system"].includes(String(executor).toLowerCase());
      }
      const executor = n.data?.executor;
      return executor && !["builtin", "dotnet", "system"].includes(String(executor).toLowerCase());
    });
  }, [nodes]);

  const selectedAgent = useMemo(() => {
    return (agents || []).find((a: any) => a.id === selectedAgentId);
  }, [agents, selectedAgentId]);

  const isSelectedAgentOnline = useMemo(() => {
    if (!selectedAgent) return false;
    return Boolean(
      (selectedAgent as any).isOnline ||
      (selectedAgent as any).isActive ||
      (selectedAgent as any).status === "Active" ||
      (selectedAgent as any).status === 1
    );
  }, [selectedAgent]);

  const requiredExecutors = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n: any) => {
      const exec = n.data?.executorKey || n.data?.executor;
      if (exec && !["builtin", "dotnet", "system"].includes(String(exec).toLowerCase())) {
        set.add(String(exec).toLowerCase());
      }
    });
    return Array.from(set);
  }, [nodes]);

  const executorReadiness = useMemo(() => {
    if (!selectedAgent) return [];
    const configs: any[] = (selectedAgent as any).executorConfigs || [];
    return requiredExecutors.map((execKey) => {
      const config = configs.find(
        (c: any) => c.executorKey?.toLowerCase() === execKey || c.id?.toLowerCase() === execKey
      );
      // Native Python runtime is inherently available if the runner agent is online
      const isAvailable = execKey === "python"
        ? isSelectedAgentOnline || Boolean(config && config.isEnabled !== false)
        : Boolean(config && config.isEnabled !== false);

      return {
        executorKey: execKey,
        isAvailable,
        version: config?.version || (execKey === "python" ? "3.10+" : null),
        path: config?.executablePath || null,
      };
    });
  }, [selectedAgent, requiredExecutors, isSelectedAgentOnline]);

  const hasMissingExecutors = useMemo(() => {
    return executorReadiness.some((item) => !item.isAvailable);
  }, [executorReadiness]);

  // Aggregate external dependencies declared across nodes
  const aggregatedDependencies = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n: any) => {
      const data = n.data || {};
      const def = data.definition || data.nodeDefinition;
      // 1. From node definition
      if (Array.isArray(def?.dependencies)) {
        def.dependencies.forEach((d: any) => {
          const pkg = typeof d === "string" ? d : d?.packageName || d?.module;
          if (pkg) set.add(pkg);
        });
      }
      // 2. From node data directly
      if (Array.isArray(data.dependencies)) {
        data.dependencies.forEach((d: any) => {
          const pkg = typeof d === "string" ? d : d?.packageName || d?.module;
          if (pkg) set.add(pkg);
        });
      }
    });
    return Array.from(set);
  }, [nodes]);

  // Hard-block execution gate if external runner is required but environment is unready
  const isBlockedByEnvironment = useMemo(() => {
    if (!requiresExternalRunner) return false;
    if (!selectedAgent) return true;
    if (!isSelectedAgentOnline) return true;
    if (hasMissingExecutors) return true;
    return false;
  }, [requiresExternalRunner, selectedAgent, isSelectedAgentOnline, hasMissingExecutors]);

  // Derived inputs: strictly rely on unified parameters (kind === "Input" or 1)
  const pipelineInputs = useMemo(() => {
    return (parameters || [])
      .filter((p) => p.kind === "Input" || (p.kind as any) === 1)
      .map((p) => ({
        id: p.id,
        key: p.key,
        label: p.label || p.key,
        type: p.type,
        cardinality: p.cardinality,
        structType: p.structType,
        defaultValue: p.defaultValue,
        isRequired: p.isRequired,
      }));
  }, [parameters]);

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
              cardinality: pin.cardinality,
              structType: pin.structType,
              metadata: pin.metadata,
            });
          }
        }
      }
    }
    return list;
  }, [nodes, edges]);

  // Convert pipeline inputs (Start Node) to FieldDefinition[]
  const startFields = useMemo(() => {
    return pipelineInputs.map((input) => pipelineInputToFieldDefinition(input as any));
  }, [pipelineInputs]);

  // Convert missing unwired inputs to FieldDefinition[]
  const missingFields = useMemo(() => {
    return additionalMissingInputs.map((input) =>
      pinToFieldDefinition(
        {
          id: input.pinId,
          label: input.pinLabel,
          primitiveType: input.primitiveType,
          cardinality: input.cardinality,
          structType: input.structType,
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
      "repository",
      "workspace",
      "contenttype",
      "runner",
      "agent",
      "tag",
      "taggroup",
      "variable",
      "none",
    ];

    pipelineInputs.forEach((input) => {
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
  }, [pipelineInputs, startFields, additionalMissingInputs]);

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

      // Separate start inputs vs node overrides
      const runtimeInputs: Record<string, any> = {};

      pipelineInputs.forEach((input) => {
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

      // Inject selectedAgentId vào runtimeInputs nếu chưa được chọn qua form
      if (selectedAgentId) {
        const runnerRef = `runner:${selectedAgentId}`;
        if (!runtimeInputs["Runner"] || runtimeInputs["Runner"] === "") {
          runtimeInputs["Runner"] = runnerRef;
        }
        if (!runtimeInputs["runner"] || runtimeInputs["runner"] === "") {
          runtimeInputs["runner"] = runnerRef;
        }
        if (!runtimeInputs["targetRunnerId"]) {
          runtimeInputs["targetRunnerId"] = selectedAgentId;
        }
      }

      try {
        const execution = await runMutation.mutateAsync({
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
          Configure runtime arguments and inputs for <span className="font-semibold text-foreground">{pipelineName}</span>.
        </p>
      </DialogHeader>

      <PipelineFormScopeProvider value={{ projectId: projectId || "", pipelineId }}>
        <form onSubmit={handleRun} className="space-y-4">
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* 0. Target Runner Machine Section (Shown when pipeline requires DCC runners) */}
            {requiresExternalRunner && (
              <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <Server className="h-4 w-4 text-primary" />
                    <span>Target Runner Machine</span>
                  </div>
                  {selectedAgent && (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-2 py-0.5 font-medium gap-1.5",
                        isSelectedAgentOnline
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          isSelectedAgentOnline ? "bg-emerald-500" : "bg-amber-500"
                        )}
                      />
                      {isSelectedAgentOnline ? "Online" : "Offline"}
                    </Badge>
                  )}
                </div>

                <Select
                  placeholder="Select target runner..."
                  selectedKey={selectedAgentId || null}
                  onSelectionChange={(key) => setSelectedAgentId(String(key))}
                  className="w-full"
                >
                  <SelectTrigger className="h-8 text-xs font-medium">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((a: any) => {
                      const isOnline = Boolean(
                        a.isOnline || a.isActive || a.status === "Active" || a.status === 1
                      );
                      return (
                        <SelectItem key={a.id} id={a.id} textValue={a.name || a.id}>
                          <div className="flex items-center justify-between w-full gap-2">
                            <span>{a.name || a.id}</span>
                            <span
                              className={cn(
                                "text-[10px] font-mono",
                                isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                              )}
                            >
                              {isOnline ? "Online" : "Offline"}
                            </span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                {!isSelectedAgentOnline && (
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-destructive/30 bg-destructive/10 text-xs text-destructive">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-semibold text-[11px]">Runner is currently Offline</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Execution is locked because the selected runner is offline. Please launch the runner daemon on your workstation before starting this pipeline.
                      </p>
                    </div>
                  </div>
                )}

                {hasMissingExecutors && isSelectedAgentOnline && (
                  <div className="flex items-start gap-2.5 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-semibold text-[11px]">Missing Required DCC Environments</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        The runner does not have executable paths configured for:{" "}
                        <strong className="text-foreground">
                          {executorReadiness.filter((i) => !i.isAvailable).map((i) => i.executorKey).join(", ")}
                        </strong>
                        . Configure paths in Runner Settings to enable execution.
                      </p>
                    </div>
                  </div>
                )}

                {/* Pre-flight DCC Environment Readiness Checklist */}
                {requiredExecutors.length > 0 && (
                  <div className="space-y-1.5 pt-1.5 border-t border-border/50">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Boxes className="size-3 text-primary" />
                        <span>Pipeline DCC Requirements</span>
                      </div>
                      {hasMissingExecutors && isSelectedAgentOnline && (
                        <span className="text-amber-600 dark:text-amber-400 font-medium normal-case text-[10px]">
                          ⚠️ Missing config detected
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {executorReadiness.map((item) => (
                        <Badge
                          key={item.executorKey}
                          variant="outline"
                          className={cn(
                            "text-[10px] px-2 py-0.5 font-mono gap-1",
                            item.isAvailable
                              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                              : "border-destructive/40 bg-destructive/5 text-destructive"
                          )}
                          title={item.path ? `Path: ${item.path}` : "Executable path not detected on runner"}
                        >
                          <span>{item.isAvailable ? "✓" : "⚠️"}</span>
                          <span className="uppercase font-semibold">{item.executorKey}</span>
                          {item.version && <span className="opacity-80">v{item.version}</span>}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dynamic Python Dependencies (Sandbox via site.addsitedir) */}
                {aggregatedDependencies.length > 0 && (
                  <div className="space-y-1.5 pt-1.5 border-t border-border/50">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <PackageCheck className="size-3 text-sky-500" />
                        <span>Dynamic Python Dependencies ({aggregatedDependencies.length})</span>
                      </div>
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium normal-case text-[10px] flex items-center gap-1">
                        <ShieldCheck className="size-3" />
                        Isolated sandbox
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {aggregatedDependencies.map((pkg) => (
                        <Badge
                          key={pkg}
                          variant="secondary"
                          className="text-[10px] px-2 py-0.5 font-mono bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20"
                        >
                          {pkg}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground italic">
                      Packages will be loaded in an isolated directory via <code className="font-mono text-[9px] bg-muted px-1 rounded">site.addsitedir</code> without modifying global system environments.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* 1. Pipeline Start Inputs Section (From Unified Parameters) */}
            {pipelineInputs.length > 0 ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                  <Sparkles className="h-4 w-4 shrink-0" />
                  <span>Pipeline Start Inputs ({pipelineInputs.length})</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Configure runtime arguments for your pipeline execution entry point.
                </p>
                <div className="rounded-lg border border-border/70 bg-card p-3 shadow-xs">
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
                <div className="rounded-lg border border-border/70 bg-card p-3 shadow-xs">
                  <FormRenderer
                    registry={pipelineRegistry}
                    control={form.control}
                    fields={missingFields}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2 border-t">
            <Button variant="outline" size="sm" onPress={onClose} isDisabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              type="submit"
              isDisabled={isSubmitting || isBlockedByEnvironment}
              className={cn(
                "gap-1.5 min-w-[120px]",
                isBlockedByEnvironment && "opacity-60 cursor-not-allowed"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Triggering...</span>
                </>
              ) : !selectedAgent && requiresExternalRunner ? (
                <span>Select a Runner</span>
              ) : !isSelectedAgentOnline && requiresExternalRunner ? (
                <span>Runner Offline</span>
              ) : hasMissingExecutors ? (
                <span>Environment Incomplete</span>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Execute Run</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </PipelineFormScopeProvider>
    </Dialog>
  );
}
