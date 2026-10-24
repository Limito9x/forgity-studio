import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  PlayCircle,
  CheckCircle2,
  Variable,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        isOpen ? "w-80" : "w-10"
      )}
    >
      <div className="relative flex flex-col h-full w-full rounded-2xl border border-border/80 bg-background/95 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Toggle Collapse Button */}
        <button
          type="button"
          onClick={onToggle}
          aria-label={isOpen ? "Collapse parameters panel" : "Expand parameters panel"}
          className="absolute -right-3 top-6 z-30 flex h-6 w-6 items-center justify-center rounded-full border border-border/80 bg-background shadow-md hover:bg-muted/80 transition-colors"
        >
          {isOpen ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {isOpen ? (
          <div className="flex flex-col h-full p-3 gap-3">
            {/* Header & Tabs */}
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setTab("inputs")}
                  className={cn(
                    "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md transition-colors",
                    activeTab === "inputs"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <PlayCircle className="h-3.5 w-3.5" />
                  <span>Inputs</span>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 font-mono">
                    {inputs.length}
                  </Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setTab("outputs")}
                  className={cn(
                    "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md transition-colors",
                    activeTab === "outputs"
                      ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Outputs</span>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 font-mono">
                    {outputs.length}
                  </Badge>
                </button>

                <button
                  type="button"
                  onClick={() => setTab("variables")}
                  className={cn(
                    "flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md transition-colors",
                    activeTab === "variables"
                      ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Variable className="h-3.5 w-3.5" />
                  <span>Vars</span>
                  <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 font-mono">
                    {variables.length}
                  </Badge>
                </button>
              </div>

              {!isCreating && !editingParam && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 rounded-md hover:bg-muted"
                  onPress={() => {
                    setIsCreating(true);
                    setEditingParam(null);
                  }}
                  aria-label={`Add ${activeTab.slice(0, -1)}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
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
          <div className="flex flex-col items-center py-4 gap-4">
            <button
              type="button"
              onClick={onToggle}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Expand parameters"
            >
              <Variable className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
