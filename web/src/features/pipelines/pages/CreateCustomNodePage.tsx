import { useState, useEffect } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { usePipelineNodeMutations, useCustomNodeById } from "../hooks/usePipelines";
import { NodeMetaForm } from "../components/node-editor/NodeMetaForm";
import { ScriptIngestionPage } from "./ScriptIngestionPage";
import { PinCardList } from "../components/node-editor/PinCardList";
import { PinConfigInspector } from "../components/node-editor/PinConfigInspector";
import type { PinDefinition } from "@/gen/model";
import { PinPrimitiveType } from "@/gen/model/pinPrimitiveType";
import { PinCardinality } from "@/gen/model/pinCardinality";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, Loader2, Workflow } from "lucide-react";
import { toast } from "sonner";

interface CreateCustomNodePageProps {
  projectId: string;
}

export function CreateCustomNodePage({ projectId }: CreateCustomNodePageProps) {
  const search = useSearch({ strict: false }) as any;
  const editNodeId = search?.editNodeId as string | undefined;

  return editNodeId ? <CustomNodeMetadataEditor key={`${projectId}:${editNodeId}`} projectId={projectId} editNodeId={editNodeId} /> : <ScriptIngestionPage key={projectId} projectId={projectId} />;
}

function CustomNodeMetadataEditor({ projectId, editNodeId }: CreateCustomNodePageProps & { editNodeId: string }) {
  const navigate = useNavigate();
  const { updateNode, isUpdatingNode } = usePipelineNodeMutations(projectId);

  const { data: existingNode, isLoading: isLoadingExisting } = useCustomNodeById(editNodeId);

  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [executor, setExecutor] = useState<"blender" | "python" | "unreal">("blender");
  const [inputs, setInputs] = useState<PinDefinition[]>([]);
  const [outputs, setOutputs] = useState<PinDefinition[]>([]);

  // Load existing node data when editing
  useEffect(() => {
    if (existingNode) {
      setName(existingNode.name || "");
      setLabel(existingNode.label || existingNode.name || "");
      if (existingNode.executor === "blender" || existingNode.executor === "python" || existingNode.executor === "unreal") {
        setExecutor(existingNode.executor);
      }
      if (existingNode.inputs) setInputs(existingNode.inputs);
      if (existingNode.outputs) setOutputs(existingNode.outputs);
    }
  }, [existingNode]);

  const [selectedPin, setSelectedPin] = useState<{
    pin: PinDefinition;
    direction: "in" | "out";
    index: number;
  } | null>(null);

  const handleAddInput = () => {
    const newPin: PinDefinition = {
      id: `param_${inputs.length + 1}`,
      label: `Param ${inputs.length + 1}`,
      primitiveType: PinPrimitiveType.NUMBER_0,
      cardinality: PinCardinality.NUMBER_0,
      isRequired: true,
      defaultValue: null,
    };
    const newInputs = [...inputs, newPin];
    setInputs(newInputs);
    setSelectedPin({ pin: newPin, direction: "in", index: newInputs.length - 1 });
  };

  const handleDeleteInput = (index: number) => {
    setInputs((prev) => prev.filter((_, i) => i !== index));
    if (selectedPin?.direction === "in" && selectedPin.index === index) {
      setSelectedPin(null);
    }
  };

  const handleAddOutput = () => {
    const newPin: PinDefinition = {
      id: `output_${outputs.length + 1}`,
      label: `Output ${outputs.length + 1}`,
      primitiveType: PinPrimitiveType.NUMBER_0,
      cardinality: PinCardinality.NUMBER_0,
      isRequired: true,
    };
    const newOutputs = [...outputs, newPin];
    setOutputs(newOutputs);
    setSelectedPin({ pin: newPin, direction: "out", index: newOutputs.length - 1 });
  };

  const handleDeleteOutput = (index: number) => {
    setOutputs((prev) => prev.filter((_, i) => i !== index));
    if (selectedPin?.direction === "out" && selectedPin.index === index) {
      setSelectedPin(null);
    }
  };

  const handleUpdateActivePin = (updated: PinDefinition) => {
    if (!selectedPin) return;

    if (selectedPin.direction === "in") {
      setInputs((prev) =>
        prev.map((p, i) => (i === selectedPin.index ? updated : p))
      );
    } else {
      setOutputs((prev) =>
        prev.map((p, i) => (i === selectedPin.index ? updated : p))
      );
    }

    setSelectedPin({ ...selectedPin, pin: updated });
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Node Identifier is required.");
      return;
    }

    await updateNode({ id: editNodeId, data: {
      name: name.trim(), label: label.trim() || name.trim(), executor,
      assetId: null, originalFileName: null, inputs, outputs,
    } });

    navigate({
      to: "/projects/$projectId/pipeline/nodes",
      params: { projectId },
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <Link
            to="/projects/$projectId/pipeline/nodes"
            params={{ projectId }}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition mb-1"
          >
            <ArrowLeft className="size-3.5" /> Back to Node Library
          </Link>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Workflow className="size-6 text-primary" />
            {editNodeId ? "Edit Custom Node" : "Create Custom Node"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {editNodeId
              ? `Editing custom node "${name || editNodeId}"`
              : "Define automation scripts and auto-detect Input/Output Pin schemas."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={() =>
              navigate({
                to: "/projects/$projectId/pipeline/nodes",
                params: { projectId },
              })
            }
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2"
            isDisabled={isUpdatingNode || isLoadingExisting || !name.trim()}
            onPress={handleSubmit}
          >
            {isUpdatingNode ? (
              <>
                <Loader2 className="size-3.5 animate-spin mr-1.5" />
                {editNodeId ? "Updating Node..." : "Saving Node..."}
              </>
            ) : (
              <>
                <Save className="size-3.5 mr-1.5" />
                {editNodeId ? "Update Custom Node" : "Save Custom Node"}
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Top Section: Meta & Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <NodeMetaForm
          name={name}
          onChangeName={setName}
          label={label}
          onChangeLabel={setLabel}
          executor={executor}
          onChangeExecutor={setExecutor}
        />

        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm">Saved script: {existingNode?.originalFileName || "No stored script"}</p>
          <p className="text-xs text-muted-foreground">Use batch ingestion to analyze and publish a replacement for this node key.</p>
          <Button variant="outline" onPress={() => navigate({
            to: "/projects/$projectId/pipeline/nodes/ingest", params: { projectId },
          })}>Publish replacement script</Button>
        </div>
      </div>

      {/* Bottom Section: Two-pane Master-Detail (Pin Cards + Config Panel) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Schema Pin Architecture
          </h2>
          <span className="text-xs text-muted-foreground">
            Click on any pin below to open its property inspector
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column: Pins Frames */}
          <div className="lg:col-span-7 space-y-4">
            <PinCardList
              inputs={inputs}
              outputs={outputs}
              selectedPin={selectedPin}
              onSelectPin={setSelectedPin}
              onAddInput={handleAddInput}
              onDeleteInput={handleDeleteInput}
              onAddOutput={handleAddOutput}
              onDeleteOutput={handleDeleteOutput}
            />
          </div>

          {/* Right Column: Pin Inspector Panel */}
          <div className="lg:col-span-5 sticky top-4">
            <PinConfigInspector
              selectedPin={selectedPin}
              onUpdatePin={handleUpdateActivePin}
              onClose={() => setSelectedPin(null)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
