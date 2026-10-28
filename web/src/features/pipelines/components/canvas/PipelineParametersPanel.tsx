import { useState, useMemo } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  PlayCircle,
  CheckCircle2,
  Variable,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineParameterDto } from "../../hooks/usePipelineGraph";
import { usePipelineFormScope } from "../../form-scope/PipelineFormScope";
import { useGetStructCatalogue } from "@/gen/endpoints/pipelines/pipelines";
import { ParameterList } from "./parameters/ParameterList";
import { ParameterEditorForm } from "./parameters/ParameterEditorForm";
import type { ParameterTab } from "./parameters/types";

export type { ParameterTab };

interface PipelineParametersPanelProps {
  pipelineId?: string;
  parameters: PipelineParameterDto[];
  onAddParameter: (param: PipelineParameterDto) => void;
  onUpdateParameter?: (key: string, param: Partial<PipelineParameterDto>) => void;
  onDeleteParameter: (key: string) => void;
  onSpawnCapsule: (
    key: string,
    kind: "Variable" | "Runner" | "Repository" | "Workspace" | "Context",
    type: any
  ) => void;
  onSpawnAction: (toolKey: "SetVariable", varName: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  activeTab?: ParameterTab;
  onTabChange?: (tab: ParameterTab) => void;
}

export function PipelineParametersPanel({
  pipelineId: _pipelineId,
  parameters = [],
  onAddParameter,
  onUpdateParameter,
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

  const [isCreating, setIsCreating] = useState(false);
  const [editingParam, setEditingParam] = useState<PipelineParameterDto | null>(null);

  const { projectId = "" } = usePipelineFormScope();
  const { data: structCatalogue = [] } = useGetStructCatalogue({ projectId });

  const setTab = (tab: ParameterTab) => {
    setIsCreating(false);
    setEditingParam(null);
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  const inputs = useMemo(
    () => parameters.filter((p) => p.kind === "Input" || (p.kind as any) === 1),
    [parameters]
  );
  const outputs = useMemo(
    () => parameters.filter((p) => p.kind === "Output" || (p.kind as any) === 2),
    [parameters]
  );
  const variables = useMemo(
    () => parameters.filter((p) => p.kind === "Variable" || (p.kind as any) === 3),
    [parameters]
  );

  const activeItems = useMemo(() => {
    switch (activeTab) {
      case "inputs":
        return inputs;
      case "outputs":
        return outputs;
      case "variables":
      default:
        return variables;
    }
  }, [activeTab, inputs, outputs, variables]);

  const existingKeys = useMemo(() => parameters.map((p) => p.key), [parameters]);

  return (
    <div
      className={cn(
        "absolute left-4 top-20 bottom-4 z-20 flex transition-all duration-300 pointer-events-auto",
        isOpen ? "w-[350px]" : "w-11"
      )}
    >
      <div className="relative flex flex-col h-full w-full rounded-2xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        {isOpen ? (
          <div className="flex flex-col h-full p-3 gap-3">
            {/* Clean Integrated Header: Tabs + Actions */}
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              {/* Segmented Pill Tabs */}
              <div className="flex items-center gap-0.5 bg-muted/40 p-0.5 rounded-lg border border-border/40">
                <button
                  type="button"
                  onClick={() => setTab("inputs")}
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-all",
                    activeTab === "inputs"
                      ? "bg-background text-emerald-600 dark:text-emerald-400 shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Pipeline Inputs"
                >
                  <PlayCircle className="h-3.5 w-3.5 text-emerald-500" />
                  <span>Inputs</span>
                  <span
                    className={cn(
                      "text-[10px] font-mono px-1 py-0 rounded",
                      activeTab === "inputs"
                        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold"
                        : "text-muted-foreground/80"
                    )}
                  >
                    {inputs.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTab("outputs")}
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-all",
                    activeTab === "outputs"
                      ? "bg-background text-sky-600 dark:text-sky-400 shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Pipeline Outputs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-sky-500" />
                  <span>Outputs</span>
                  <span
                    className={cn(
                      "text-[10px] font-mono px-1 py-0 rounded",
                      activeTab === "outputs"
                        ? "bg-sky-500/15 text-sky-600 dark:text-sky-400 font-bold"
                        : "text-muted-foreground/80"
                    )}
                  >
                    {outputs.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setTab("variables")}
                  className={cn(
                    "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-all",
                    activeTab === "variables"
                      ? "bg-background text-violet-600 dark:text-violet-400 shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Pipeline Variables"
                >
                  <Variable className="h-3.5 w-3.5 text-violet-500" />
                  <span>Vars</span>
                  <span
                    className={cn(
                      "text-[10px] font-mono px-1 py-0 rounded",
                      activeTab === "variables"
                        ? "bg-violet-500/15 text-violet-600 dark:text-violet-400 font-bold"
                        : "text-muted-foreground/80"
                    )}
                  >
                    {variables.length}
                  </span>
                </button>
              </div>

              {/* Action Buttons: Add + Collapse */}
              <div className="flex items-center gap-1 ml-1.5 shrink-0">
                {!isCreating && !editingParam && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(true);
                      setEditingParam(null);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                    title={`Add new ${activeTab === "variables" ? "variable" : activeTab === "inputs" ? "input" : "output"}`}
                    aria-label={`Add ${activeTab.slice(0, -1)}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onToggle}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                  title="Collapse panel"
                  aria-label="Collapse parameters panel"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Creation or Edit Form Modal / Inline Section */}
            {isCreating && (
              <ParameterEditorForm
                mode="create"
                activeTab={activeTab}
                existingKeys={existingKeys}
                structCatalogue={structCatalogue}
                onSaveCreate={(param) => {
                  onAddParameter(param);
                  setIsCreating(false);
                }}
                onSaveEdit={() => {}}
                onCancel={() => setIsCreating(false)}
              />
            )}

            {editingParam && (
              <ParameterEditorForm
                mode="edit"
                activeTab={activeTab}
                editingParam={editingParam}
                existingKeys={existingKeys}
                structCatalogue={structCatalogue}
                onSaveCreate={() => {}}
                onSaveEdit={(key, patch) => {
                  if (onUpdateParameter) {
                    onUpdateParameter(key, patch);
                  }
                  setEditingParam(null);
                }}
                onCancel={() => setEditingParam(null)}
              />
            )}

            {/* Parameter List */}
            <ParameterList
              activeTab={activeTab}
              items={activeItems}
              onEdit={(param) => {
                setIsCreating(false);
                setEditingParam(param);
              }}
              onDelete={onDeleteParameter}
              onSpawnCapsule={onSpawnCapsule}
              onSpawnAction={onSpawnAction}
            />
          </div>
        ) : (
          /* Sleek Collapsed Strip */
          <div className="flex flex-col items-center py-3 gap-2 h-full">
            <button
              type="button"
              onClick={onToggle}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              title="Expand parameters panel"
              aria-label="Expand parameters panel"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>

            <div className="w-5 h-px bg-border/60 my-0.5" />

            {/* Quick-select Tab Icons with Notification Dot/Badge */}
            <button
              type="button"
              onClick={() => {
                setTab("inputs");
                if (!isOpen) onToggle();
              }}
              className="relative flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
              title={`Inputs (${inputs.length})`}
            >
              <PlayCircle className="h-4 w-4 text-emerald-500" />
              {inputs.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] font-mono font-bold text-white px-0.5">
                  {inputs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setTab("outputs");
                if (!isOpen) onToggle();
              }}
              className="relative flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-sky-500 hover:bg-sky-500/10 transition-colors"
              title={`Outputs (${outputs.length})`}
            >
              <CheckCircle2 className="h-4 w-4 text-sky-500" />
              {outputs.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 text-[8px] font-mono font-bold text-white px-0.5">
                  {outputs.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setTab("variables");
                if (!isOpen) onToggle();
              }}
              className="relative flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:text-violet-500 hover:bg-violet-500/10 transition-colors"
              title={`Variables (${variables.length})`}
            >
              <Variable className="h-4 w-4 text-violet-500" />
              {variables.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-violet-500 text-[8px] font-mono font-bold text-white px-0.5">
                  {variables.length}
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
