import { useState } from "react";
import {
  Variable,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  PlayCircle,
  CheckCircle2,
  Pill,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { PipelineParameterDto, PipelineParameterKind } from "../../hooks/usePipelineGraph";
import { usePipelineFormScope } from "../../form-scope/PipelineFormScope";
import { useGetProjectStructs } from "@/features/structs/hooks/useStructs";
import { toast } from "sonner";

export type ParameterTab = "inputs" | "outputs" | "variables";

interface PipelineParametersPanelProps {
  pipelineId?: string;
  parameters: PipelineParameterDto[];
  onAddParameter: (param: PipelineParameterDto) => void;
  onUpdateParameter?: (key: string, param: Partial<PipelineParameterDto>) => void;
  onDeleteParameter: (key: string) => void;
  onSpawnCapsule: (key: string, kind: "Variable" | "Runner" | "Workspace" | "Context", type: any) => void;
  onSpawnAction: (toolKey: "SetVariable", varName: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  activeTab?: ParameterTab;
  onTabChange?: (tab: ParameterTab) => void;
}

const TYPE_OPTIONS = [
  { value: "0", label: "String", color: "text-sky-500 bg-sky-500/10 border-sky-500/30" },
  { value: "1", label: "Number", color: "text-violet-500 bg-violet-500/10 border-violet-500/30" },
  { value: "2", label: "Boolean", color: "text-amber-500 bg-amber-500/10 border-amber-500/30" },
  { value: "3", label: "Path", color: "text-orange-500 bg-orange-500/10 border-orange-500/30" },
  { value: "4", label: "EntityRef / Struct", color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30" },
  { value: "5", label: "Asset", color: "text-pink-500 bg-pink-500/10 border-pink-500/30" },
];

const CARDINALITY_OPTIONS = [
  { value: "0", label: "Single" },
  { value: "1", label: "Array []" },
  { value: "2", label: "Map {}" },
];

export function PipelineParametersPanel({
  pipelineId: _pipelineId,
  parameters = [],
  onAddParameter,
  onUpdateParameter: _onUpdateParameter,
  onDeleteParameter,
  onSpawnCapsule,
  onSpawnAction,
  isOpen,
  onToggle,
  activeTab: controlledTab,
  onTabChange,
}: PipelineParametersPanelProps) {
  const [internalTab, setInternalTab] = useState<ParameterTab>("variables");
  const activeTab = controlledTab ?? internalTab;

  const setTab = (tab: ParameterTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const { projectId = "" } = usePipelineFormScope();
  const { data: projectStructs = [] } = useGetProjectStructs(projectId);

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("0");
  const [cardinality, setCardinality] = useState("0");
  const [structType, setStructType] = useState("Resource");
  const [defaultValue, setDefaultValue] = useState("");
  const [description, setDescription] = useState("");
  const [isRequired, setIsRequired] = useState(false);

  // Filter parameters by kind
  const inputs = parameters.filter((p) => p.kind === 1 || (p.kind as unknown) === "Input");
  const outputs = parameters.filter((p) => p.kind === 2 || (p.kind as unknown) === "Output");
  const variables = parameters.filter((p) => p.kind === 3 || (p.kind as unknown) === "Variable");

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Parameter name is required.");
      return;
    }

    if (parameters.some((p) => p.key.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`Parameter with key '${trimmed}' already exists.`);
      return;
    }

    const kindMap: Record<ParameterTab, PipelineParameterKind> = {
      inputs: 1,
      outputs: 2,
      variables: 3,
    };

    const newParam: PipelineParameterDto = {
      id: crypto.randomUUID(),
      key: trimmed,
      label: trimmed,
      kind: kindMap[activeTab],
      type: Number(type) as any,
      cardinality: Number(cardinality) as any,
      structType: type === "5" ? structType : null,
      defaultValue: defaultValue.trim() || null,
      description: description.trim() || null,
      isRequired,
      order: parameters.length + 1,
      contextData: null,
    };

    onAddParameter(newParam);
    toast.success(`Added ${activeTab.slice(0, -1)} '${trimmed}'`);
    setName("");
    setDefaultValue("");
    setDescription("");
    setIsRequired(false);
    setIsCreating(false);
  };

  const getTypeStyle = (t: number | string, c?: number | string, sType?: string | null) => {
    const tStr = String(t);
    const opt = TYPE_OPTIONS.find((o) => o.value === tStr) || TYPE_OPTIONS[0];
    const isMap = c === 2 || c === "2" || c === "Map";
    const isArr = c === 1 || c === "1" || c === "Array";
    const label = tStr === "4" && sType ? sType : opt.label;

    return {
      label: isMap ? `Map<${label}>` : isArr ? `${label}[]` : label,
      color: opt.color,
    };
  };

  return (
    <aside
      className={cn(
        "absolute left-3 top-16 bottom-3 z-20 flex flex-col transition-all duration-300 ease-in-out",
        isOpen ? "w-88" : "w-10"
      )}
    >
      <div className="flex h-full flex-col rounded-xl border border-border/80 bg-background/95 backdrop-blur-md shadow-2xl overflow-hidden">
        {/* Panel Header */}
        <div className="flex h-11 items-center justify-between border-b border-border/60 px-3 bg-muted/30">
          <div className="flex items-center gap-2 overflow-hidden">
            <Variable className="h-4 w-4 shrink-0 text-cyan-500" />
            {isOpen && (
              <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground truncate">
                <span>Parameters</span>
                <Badge variant="secondary" className="px-1.5 py-0 h-4 text-[10px] font-mono">
                  {parameters.length}
                </Badge>
              </div>
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onPress={onToggle}
          >
            {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>

        {isOpen && (
          <div className="flex flex-1 flex-col overflow-hidden p-3 gap-3">
            {/* 3 Tabs Segmented Control */}
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-muted/60 text-xs select-none">
              <button
                type="button"
                onClick={() => { setTab("inputs"); setIsCreating(false); }}
                className={cn(
                  "flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-medium transition-all",
                  activeTab === "inputs"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <PlayCircle className="w-3 h-3 text-emerald-500" />
                <span>In ({inputs.length})</span>
              </button>

              <button
                type="button"
                onClick={() => { setTab("outputs"); setIsCreating(false); }}
                className={cn(
                  "flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-medium transition-all",
                  activeTab === "outputs"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <CheckCircle2 className="w-3 h-3 text-sky-500" />
                <span>Out ({outputs.length})</span>
              </button>

              <button
                type="button"
                onClick={() => { setTab("variables"); setIsCreating(false); }}
                className={cn(
                  "flex items-center justify-center gap-1 py-1 rounded-md text-[11px] font-medium transition-all",
                  activeTab === "variables"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Variable className="w-3 h-3 text-violet-500" />
                <span>Vars ({variables.length})</span>
              </button>
            </div>

            {/* Action Bar */}

            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted-foreground capitalize">
                {activeTab} Management
              </span>
              {!isCreating && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                  onPress={() => setIsCreating(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add {activeTab.slice(0, -1)}</span>
                </Button>
              )}
            </div>


            {/* Inline Creation Form */}
            {isCreating && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary capitalize">
                    New {activeTab.slice(0, -1)}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                    onPress={() => setIsCreating(false)}
                  >
                    Cancel
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground block">
                    Key / Name
                  </label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. TargetList, ExportDir"
                    className="h-7 text-xs font-mono"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground block">
                      Type
                    </label>
                    <Select
                      selectedKey={type}
                      onSelectionChange={(key) => key && setType(String(key))}
                      className="w-full"
                    >
                      <SelectTrigger className="h-7 text-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} id={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground block">
                      Cardinality
                    </label>
                    <Select
                      selectedKey={cardinality}
                      onSelectionChange={(key) => key && setCardinality(String(key))}
                      className="w-full"
                    >
                      <SelectTrigger className="h-7 text-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CARDINALITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} id={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {type === "4" && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground block">
                      Struct Schema
                    </label>
                    <Select
                      selectedKey={structType}
                      onSelectionChange={(key) => key && setStructType(String(key))}
                      className="w-full"
                    >
                      <SelectTrigger className="h-7 text-xs w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem id="Runner">Runner</SelectItem>
                        <SelectItem id="Resource">Resource</SelectItem>
                        <SelectItem id="Workspace">Workspace</SelectItem>
                        <SelectItem id="ContentType">ContentType</SelectItem>
                        {projectStructs.map((s: any) => (
                          <SelectItem key={s.name} id={s.name}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {activeTab !== "outputs" && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground block">
                      Default Value (Optional)
                    </label>
                    <Input
                      value={defaultValue}
                      onChange={(e) => setDefaultValue(e.target.value)}
                      placeholder="Default value"
                      className="h-7 text-xs"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground block">
                    Description
                  </label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short description"
                    className="h-7 text-xs"
                  />
                </div>

                <Button
                  size="sm"
                  className="w-full h-7 text-xs bg-primary text-primary-foreground font-semibold"
                  onPress={handleCreate}
                >
                  Create
                </Button>
              </div>
            )}

            {/* Parameters List */}
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-2">
                {/* 1. INPUTS TAB */}
                {activeTab === "inputs" && (
                  <>
                    {inputs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground/60 border border-dashed rounded-lg">
                        <PlayCircle className="h-7 w-7 mb-2 stroke-1 text-emerald-500/50" />
                        <span className="text-xs font-medium">No inputs declared yet</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          Inputs provide contract values into the Start node.
                        </span>
                      </div>
                    ) : (
                      inputs.map((param) => {
                        const style = getTypeStyle(param.type, param.cardinality, param.structType);
                        return (
                          <div
                            key={param.key}
                            draggable
                            onDragStart={(e) => {
                              const payload = {
                                ...param,
                                name: param.key,
                                category: "Input",
                                kind: "Input",
                              };
                              e.dataTransfer.setData("application/pipeline-parameter", JSON.stringify(payload));
                              e.dataTransfer.setData("application/pipeline-variable", JSON.stringify(payload));
                              e.dataTransfer.effectAllowed = "copyMove";
                            }}
                            className="group relative flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-2.5 hover:border-emerald-500/40 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing select-none"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground" />
                                <span className="font-mono text-xs font-semibold text-foreground truncate">
                                  {param.label || param.key}
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn("text-[9px] px-1.5 py-0 h-4 border font-mono", style.color)}
                              >
                                {style.label}
                              </Badge>
                            </div>
                            {param.description && (
                              <p className="text-[10px] text-muted-foreground line-clamp-2 pl-5">
                                {param.description}
                              </p>
                            )}
                            <div className="flex items-center justify-between pt-1 border-t border-border/30 pl-5">
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 px-1.5 text-[10px] gap-1 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-mono"
                                  onPress={() => onSpawnCapsule?.(param.key, "Input" as any, param.type)}
                                  aria-label="Spawn Input Capsule getter on canvas"
                                >
                                  <span>Capsule</span>
                                </Button>
                                <span className="text-[10px] text-muted-foreground/70 font-mono truncate max-w-[90px]">
                                  Def: {String(param.defaultValue ?? "none")}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                onPress={() => onDeleteParameter(param.key)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                )}

                {/* 2. OUTPUTS TAB */}
                {activeTab === "outputs" && (
                  <>
                    {outputs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground/60 border border-dashed rounded-lg">
                        <CheckCircle2 className="h-7 w-7 mb-2 stroke-1 text-sky-500/50" />
                        <span className="text-xs font-medium">No outputs declared yet</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          Outputs are collected at the Return node and snapshotted to ExecutionState.
                        </span>
                      </div>
                    ) : (
                      outputs.map((param) => {
                        const style = getTypeStyle(param.type, param.cardinality, param.structType);
                        return (
                          <div
                            key={param.key}
                            className="group relative flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-2.5 hover:border-sky-500/40 hover:shadow-sm transition-all"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-mono text-xs font-semibold text-foreground truncate">
                                {param.label || param.key}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn("text-[9px] px-1.5 py-0 h-4 border font-mono", style.color)}
                              >
                                {style.label}
                              </Badge>
                            </div>
                            {param.description && (
                              <p className="text-[10px] text-muted-foreground line-clamp-2">
                                {param.description}
                              </p>
                            )}
                            <div className="flex items-center justify-end pt-1 border-t border-border/30">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                onPress={() => onDeleteParameter(param.key)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                )}

                {/* 3. VARIABLES TAB */}
                {activeTab === "variables" && (
                  <>
                    {variables.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground/60 border border-dashed rounded-lg">
                        <Variable className="h-7 w-7 mb-2 stroke-1 text-violet-500/50" />
                        <span className="text-xs font-medium">No variables declared</span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          Variables form the shared memory blackboard of this pipeline.
                        </span>
                      </div>
                    ) : (
                      variables.map((param) => {
                        const style = getTypeStyle(param.type, param.cardinality, param.structType);
                        return (
                          <div
                            key={param.key}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "application/pipeline-variable",
                                JSON.stringify(param)
                              );
                              e.dataTransfer.effectAllowed = "copyMove";
                            }}
                            className="group relative flex flex-col gap-1.5 rounded-lg border border-border/60 bg-card p-2.5 hover:border-violet-500/40 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing select-none"
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground" />
                                <span className="font-mono text-xs font-semibold text-foreground truncate">
                                  {param.label || param.key}
                                </span>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn("text-[9px] px-1.5 py-0 h-4 border font-mono", style.color)}
                              >
                                {style.label}
                              </Badge>
                            </div>

                            {param.description && (
                              <p className="text-[10px] text-muted-foreground line-clamp-2 pl-5">
                                {param.description}
                              </p>
                            )}

                            {/* Action Buttons: 💊 Capsule Getter | ⚡ Action Setter */}
                            <div className="flex items-center justify-between pt-1 border-t border-border/30 pl-5">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[10px] gap-1 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                                  onPress={() => onSpawnCapsule(param.key, "Variable", param.type)}
                                >
                                  <Pill className="w-2.5 h-2.5" />
                                  <span>Get</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1.5 text-[10px] gap-1 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
                                  onPress={() => onSpawnAction("SetVariable", param.key)}
                                >
                                  <Zap className="w-2.5 h-2.5" />
                                  <span>Set</span>
                                </Button>
                              </div>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                                onPress={() => onDeleteParameter(param.key)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </>
                )}

              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </aside>
  );
}
