import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Trash2,
  Sliders,
  Sparkles,
  Plus,
  Loader2,
  Zap,
  FolderTree,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  usePipelineInputSchema,
  useAddPipelineInput,
  useDeletePipelineInput,
  useUpdatePipelineTrigger,
} from "../../hooks/usePipelineGraph";
import { useRepositories } from "@/features/repositories/hooks/useRepositories";
import { getPinVisual, formatPinTypeLabel } from "./CustomPipelineNode";
import { toast } from "sonner";

const PIN_PRIMITIVE_TYPES = [
  { value: "String", label: "String" },
  { value: "Number", label: "Number" },
  { value: "Boolean", label: "Boolean" },
  { value: "Path", label: "Path" },
  { value: "EntityRef", label: "Entity Reference (Resource/Workspace/Tag/...)" },
  { value: "Asset", label: "File Upload" },
];

const CARDINALITY_OPTIONS = [
  { value: "Single", label: "Single" },
  { value: "Array", label: "Array []" },
  { value: "Map", label: "Map (Dictionary)" },
];

const ENTITY_TARGETS = [
  { value: "Resource", label: "Resource File (3D Asset / File in Workspace)" },
  { value: "Workspace", label: "Workspace" },
  { value: "Tag", label: "Tag" },
  { value: "Agent", label: "Agent Worker" },
];

interface PipelineStartNodeInspectorProps {
  pipelineId: string;
  projectId?: string;
  triggerType?: number | string;
  triggerWorkspaceId?: string | null;
  triggerConfig?: any;
}

export function PipelineStartNodeInspector({
  pipelineId,
  projectId = "",
  triggerType = 0,
  triggerWorkspaceId = null,
  triggerConfig = null,
}: PipelineStartNodeInspectorProps) {
  const { data: schemaInputs = [], refetch: refetchSchema } = usePipelineInputSchema(pipelineId);
  const { data: workspaces = [] } = useRepositories(projectId);
  const addInputMutation = useAddPipelineInput(pipelineId);
  const deleteInputMutation = useDeletePipelineInput(pipelineId);
  const updateTriggerMutation = useUpdatePipelineTrigger(pipelineId);

  const isEventTrigger =
    triggerType === 1 ||
    triggerType === 2 ||
    triggerType === "OnResourceCreated" ||
    triggerType === "OnResourceVersionUpdated";

  const initialExtensions = useMemo(() => {
    if (!triggerConfig) return "";
    if (typeof triggerConfig === "object") {
      const cfg = triggerConfig as Record<string, any>;
      if (Array.isArray(cfg.extensions)) return cfg.extensions.join(", ");
      if (typeof cfg.extensions === "string") return cfg.extensions;
      if (typeof cfg.extension === "string") return cfg.extension;
    }
    return "";
  }, [triggerConfig]);

  const [extFilter, setExtFilter] = useState(initialExtensions);
  useEffect(() => {
    setExtFilter(initialExtensions);
  }, [initialExtensions]);

  const handleSaveExtensions = async (val: string) => {
    const exts = val
      .split(",")
      .map((s) => s.trim().replace(/^\./, "").toLowerCase())
      .filter(Boolean);
    const existingObj = triggerConfig && typeof triggerConfig === "object" ? (triggerConfig as Record<string, any>) : {};
    const updatedConfig = {
      ...existingObj,
      extensions: exts,
    };
    const currentTypeNum =
      triggerType === 1 || triggerType === "OnResourceCreated"
        ? 1
        : triggerType === 2 || triggerType === "OnResourceVersionUpdated"
        ? 2
        : 0;
    try {
      await updateTriggerMutation.mutateAsync({
        triggerType: currentTypeNum,
        triggerWorkspaceId: triggerWorkspaceId || null,
        triggerConfig: updatedConfig,
      });
      toast.success("Trigger extension filter updated");
    } catch {
      toast.error("Failed to update trigger config");
    }
  };

  const [isAddingInput, setIsAddingInput] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [isKeyManuallyEdited, setIsKeyManuallyEdited] = useState(false);
  const [newType, setNewType] = useState("String");
  const [newCardinality, setNewCardinality] = useState("Single");
  const [newEntityTarget, setNewEntityTarget] = useState("Resource");
  const [newIsRequired, setNewIsRequired] = useState(true);
  const [newDefaultValue, setNewDefaultValue] = useState("");
  const [isSubmittingInput, setIsSubmittingInput] = useState(false);

  const toIdentifierKey = (text: string): string => {
    if (!text) return "";
    const words = text.replace(/[^a-zA-Z0-9\s_]/g, "").trim().split(/[\s_]+/);
    if (words.length === 0 || !words[0]) return "";
    const pascal = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
    return /^[0-9]/.test(pascal) ? `Param${pascal}` : pascal;
  };

  const handleLabelChange = (val: string) => {
    setNewLabel(val);
    if (!isKeyManuallyEdited) {
      setNewKey(toIdentifierKey(val));
    }
  };

  const handleKeyChange = (val: string) => {
    setNewKey(val);
    setIsKeyManuallyEdited(true);
  };

  const handleSaveInput = async () => {
    if (!newKey.trim()) {
      toast.error("Parameter Key is required");
      return;
    }
    const cleanKey = toIdentifierKey(newKey);
    if (!cleanKey) {
      toast.error("Key must be a valid identifier (alphanumeric)");
      return;
    }

    if (schemaInputs.some((i) => i.key.toLowerCase() === cleanKey.toLowerCase())) {
      toast.error(`Parameter with key "${cleanKey}" already exists`);
      return;
    }

    setIsSubmittingInput(true);
    try {
      const defaultValue = newType === "EntityRef" ? newEntityTarget : (newDefaultValue.trim() || null);
      await addInputMutation.mutateAsync({
        key: cleanKey,
        label: newLabel.trim() || cleanKey,
        type: newType,
        cardinality: newCardinality,
        isRequired: newIsRequired,
        defaultValue,
        order: schemaInputs.length,
      });

      toast.success(`Parameter "${cleanKey}" added`);
      setIsAddingInput(false);
      setNewKey("");
      setNewLabel("");
      setIsKeyManuallyEdited(false);
      setNewDefaultValue("");
      refetchSchema();
    } catch {
      toast.error("Failed to add parameter");
    } finally {
      setIsSubmittingInput(false);
    }
  };

  const handleDeleteInput = async (inputId: string, inputKey: string) => {
    try {
      await deleteInputMutation.mutateAsync(inputId);
      toast.success(`Parameter "${inputKey}" deleted`);
      refetchSchema();
    } catch {
      toast.error("Failed to delete parameter");
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Trigger Settings Block */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">Pipeline Trigger Mode</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">Execution Trigger</label>
          <Select
            selectedKey={String(triggerType)}
            onSelectionChange={async (key) => {
              const val = Number(key);
              try {
                await updateTriggerMutation.mutateAsync({
                  triggerType: val,
                  triggerWorkspaceId: val === 0 ? null : triggerWorkspaceId || null,
                  triggerConfig: triggerConfig || null,
                });
                toast.success("Trigger type updated");
              } catch {
                toast.error("Failed to update trigger");
              }
            }}
            className="w-full"
          >
            <SelectTrigger className="h-8 w-full text-xs font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem id="0">Manual / API Trigger</SelectItem>
              <SelectItem id="1">Workspace: On Resource Created</SelectItem>
              <SelectItem id="2">Workspace: On Resource Version Updated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isEventTrigger && (
          <div className="space-y-3 pt-1 border-t border-primary/10">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <FolderTree className="h-3 w-3 text-muted-foreground" />
                <label className="text-[11px] font-medium text-muted-foreground">Monitored Workspace</label>
              </div>
              <Select
                selectedKey={triggerWorkspaceId || "none"}
                onSelectionChange={async (key) => {
                  const val = key === "none" ? null : String(key);
                  const currentTypeNum =
                    triggerType === 1 || triggerType === "OnResourceCreated"
                      ? 1
                      : triggerType === 2 || triggerType === "OnResourceVersionUpdated"
                      ? 2
                      : 0;
                  try {
                    await updateTriggerMutation.mutateAsync({
                      triggerType: currentTypeNum,
                      triggerWorkspaceId: val,
                      triggerConfig: triggerConfig || null,
                    });
                    toast.success("Trigger workspace updated");
                  } catch {
                    toast.error("Failed to update trigger workspace");
                  }
                }}
                className="w-full"
              >
                <SelectTrigger className="h-8 w-full text-xs font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem id="none">-- Select Workspace --</SelectItem>
                  {workspaces.map((w: any) => (
                    <SelectItem key={w.id} id={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                File Extension Filter <span className="text-[10px] text-muted-foreground/80">(comma separated)</span>
              </label>
              <Input
                value={extFilter}
                onChange={(e) => setExtFilter(e.target.value)}
                onBlur={(e) => handleSaveExtensions(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                placeholder="e.g. blend, fbx, obj (leave empty for all)"
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Pipeline Input Parameters Block */}
      {isEventTrigger && (
        <div className="rounded-xl border border-muted bg-muted/20 p-3.5 space-y-2 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Automatic Event Payload</p>
          <p className="text-[11px] leading-relaxed">
            When triggered by a workspace event, this pipeline automatically receives runtime inputs including:
          </p>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] font-mono text-foreground/80">
            <li>ResourceId (UUID string)</li>
            <li>WorkspaceId (UUID string)</li>
            <li>VersionNumber (Integer)</li>
            <li>Action ("Created" | "Updated")</li>
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between pt-1">

            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Sliders className="h-3.5 w-3.5 text-primary" />
              <span>Input Parameters ({schemaInputs.length})</span>
            </div>

            {!isAddingInput && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onPress={() => setIsAddingInput(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Input</span>
              </Button>
            )}
          </div>

          {/* Add Input Form */}
          {isAddingInput && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  New Input Parameter
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingInput(false)}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  Cancel
                </button>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Display Label</label>
                <Input
                  value={newLabel}
                  onChange={(e) => handleLabelChange(e.target.value)}
                  placeholder="e.g. Target Workspace"
                  className="h-8 text-xs"
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Identifier Key <span className="text-destructive">*</span>
                </label>
                <Input
                  value={newKey}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  placeholder="e.g. TargetWorkspace"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Data Type</label>
                  <Select
                    selectedKey={newType}
                    onSelectionChange={(key) => setNewType(String(key))}
                    className="w-full"
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIN_PRIMITIVE_TYPES.map((pt) => (
                        <SelectItem key={pt.value} id={pt.value}>
                          {pt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Cardinality</label>
                  <Select
                    selectedKey={newCardinality}
                    onSelectionChange={(key) => setNewCardinality(String(key))}
                    className="w-full"
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CARDINALITY_OPTIONS.map((c) => (
                        <SelectItem key={c.value} id={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {newType === "EntityRef" ? (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Target Entity</label>
                  <Select
                    selectedKey={newEntityTarget}
                    onSelectionChange={(key) => setNewEntityTarget(String(key))}
                    className="w-full"
                  >
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_TARGETS.map((t) => (
                        <SelectItem key={t.value} id={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Default Value</label>
                  <Input
                    value={newDefaultValue}
                    onChange={(e) => setNewDefaultValue(e.target.value)}
                    placeholder="Optional default..."
                    className="h-8 text-xs font-mono"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">Required parameter</span>
                <Switch isSelected={newIsRequired} onChange={setNewIsRequired} />
              </div>

              <Button
                className="w-full h-8 text-xs font-medium"
                onPress={handleSaveInput}
                isDisabled={isSubmittingInput}
              >
                {isSubmittingInput ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  <span>Save Parameter</span>
                )}
              </Button>
            </div>
          )}

          {/* List of Current Pipeline Inputs */}
          {schemaInputs.length === 0 && !isAddingInput ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground space-y-2">
              <p className="italic">No input parameters configured.</p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onPress={() => setIsAddingInput(true)}
              >
                <Plus className="h-3 w-3" />
                <span>Add First Parameter</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {schemaInputs.map((input) => {
                const visual = getPinVisual(input.type);
                return (
                  <div key={input.id} className="rounded-lg border border-border/70 bg-card p-3 space-y-2 shadow-sm group/item">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {input.label || input.key}
                        </span>
                        {input.isRequired && (
                          <span className="text-destructive font-bold text-xs" title="Required">*</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className={cn("text-[9px] font-mono px-1.5 h-4", visual.textClass)}>
                          {formatPinTypeLabel(input.type, input.cardinality)}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => handleDeleteInput(input.id, input.key)}
                          className="text-muted-foreground/60 hover:text-destructive p-1 rounded transition-colors"
                          title="Delete Parameter"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>

                    <div className="text-[10px] text-muted-foreground font-mono flex items-center justify-between">
                      <span>Key: {input.key}</span>
                      {input.defaultValue && (
                        <span className="truncate max-w-[120px]" title={input.defaultValue}>
                          Default: {input.defaultValue}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
    </div>
  );
}

