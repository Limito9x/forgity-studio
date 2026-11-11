import { useEffect, useState, useMemo } from "react";
import {
  Laptop,
  RefreshCw,
  Settings2,
  FileCode2,
  Play,
  UploadCloud,
  FolderOpen,
  Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocalWorkspaceStore } from "../stores/useLocalWorkspaceStore";
import { LocalWorkspaceEmptyState } from "../components/workspace/LocalWorkspaceEmptyState";
import { LocalWorkspaceOutliner } from "../components/workspace/LocalWorkspaceOutliner";
import { WorkspaceConfigDialog } from "../components/workspace/WorkspaceConfigDialog";
import { LocalScriptSyncSheet } from "../components/workspace/LocalScriptSyncSheet";
import { PublishToStudioDialog } from "../components/canvas/PublishToStudioDialog";
import { PipelineCanvas } from "../components/canvas/PipelineCanvas";
import { pipelineYamlToGraph } from "../utils/pipelineDslConverter";
import { useRunDraftPipeline } from "@/gen/endpoints/pipelines/pipelines";
import { getLocalMachineInfo } from "@/lib/platform/filePickerStrategy";
import { PipelineNodeKind } from "@/gen/model/pipelineNodeKind";
import { PipelineTriggerType } from "@/gen/model/pipelineTriggerType";
import type { LocalDraftNode, ScannedPipelineYamlItemRust } from "../types/workspaceConfig";
import type { ExtendedPipelineGraphDto, SavePipelineNodeItem, SavePipelineEdgeItem } from "../hooks/usePipelineGraph";

interface LocalWorkspacePageProps {
  projectId: string;
}

export function LocalWorkspacePage({ projectId }: LocalWorkspacePageProps) {
  const {
    rootPath,
    draftNodes,
    isScanning,
    isLoading,
    initWorkspace,
    scanDraftPipelines,
    activeDraftPipeline,
    setActiveDraftPipeline,
    savePipelineDraft,
  } = useLocalWorkspaceStore();

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [syncSheetOpen, setSyncSheetOpen] = useState(false);
  const [syncSheetInitialKey, setSyncSheetInitialKey] = useState<string | undefined>();
  const [selectedScript, setSelectedScript] = useState<LocalDraftNode | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "yaml">("visual");
  const [rawYamlContent, setRawYamlContent] = useState("");

  const runDraftMutation = useRunDraftPipeline();

  useEffect(() => {
    if (projectId) {
      initWorkspace(projectId).then(() => {
        scanDraftPipelines();
      });
    }
  }, [projectId, initWorkspace, scanDraftPipelines]);

  useEffect(() => {
    if (activeDraftPipeline) {
      setRawYamlContent(activeDraftPipeline.content);
    }
  }, [activeDraftPipeline?.fullPath, activeDraftPipeline?.content]);

  const draftNodeList = Object.values(draftNodes);

  // Parse active draft YAML into ExtendedPipelineGraphDto for PipelineCanvas
  const parsedCanvasGraph = useMemo<ExtendedPipelineGraphDto | null>(() => {
    if (!activeDraftPipeline?.content) return null;
    try {
      const parsed = pipelineYamlToGraph(activeDraftPipeline.content);
      const graphDto: ExtendedPipelineGraphDto = {
        id: activeDraftPipeline.fullPath,
        name: parsed.name || activeDraftPipeline.fileName,
        projectId,
        triggerType: PipelineTriggerType.Manual,
        nodes: parsed.nodes.map((n) => {
          const matchedScript = Object.values(draftNodes).find(
            (d) => d.key === n.data?.refId || `local:${d.key}` === n.data?.refId
          );
          return {
            id: n.id,
            refId: (n.data?.refId as string) || n.id,
            label: (n.data?.label as string) || n.id,
            kind: n.data?.isLocalDraft ? PipelineNodeKind.Custom : PipelineNodeKind.Tool,
            category: matchedScript?.executor || (n.data?.category as string) || "Tool",
            executor: matchedScript?.executor || (n.data?.executor as string) || "python",
            position: n.position,
            parentId: n.parentId || null,
            configValues: (n.data?.configValues as any) || {},
            inputs: matchedScript?.inputs || [],
            outputs: matchedScript?.outputs || [],
            metadata: {
              isLocalDraft: n.data?.isLocalDraft,
              label: n.data?.label,
            },
          };
        }),
        edges: parsed.edges.map((e) => ({
          id: e.id,
          sourceNodeId: e.source,
          sourcePin: e.sourceHandle || "out",
          targetNodeId: e.target,
          targetPin: e.targetHandle || "in",
        })),
        parameters: [],
      };
      return graphDto;
    } catch (err: any) {
      console.warn("[LocalWorkspacePage] Failed to parse pipeline YAML:", err);
      return null;
    }
  }, [activeDraftPipeline, projectId]);

  const handleSelectScript = (node: LocalDraftNode) => {
    setSelectedScript(node);
  };

  const handleOpenSyncAndReview = (scriptKey?: string) => {
    setSyncSheetInitialKey(scriptKey);
    setSyncSheetOpen(true);
  };

  const handleSelectDraft = (draft: ScannedPipelineYamlItemRust) => {
    setActiveDraftPipeline(draft);
    setSelectedScript(null);
  };

  const handleSaveRawYaml = async () => {
    if (!activeDraftPipeline) return;
    try {
      await savePipelineDraft(activeDraftPipeline.fullPath, rawYamlContent);
      toast.success("Pipeline YAML saved to disk!");
    } catch (err: any) {
      toast.error("Failed to save pipeline YAML", { description: err?.message });
    }
  };

  const handleRunDraft = async () => {
    if (!activeDraftPipeline) return;

    try {
      const parsed = pipelineYamlToGraph(activeDraftPipeline.content);
      const machineInfo = await getLocalMachineInfo();
      const saveNodes: SavePipelineNodeItem[] = parsed.nodes.map((n, idx) => ({
        id: n.id,
        refId: String(n.data?.refId || n.id),
        kind: n.data?.isLocalDraft ? PipelineNodeKind.Custom : PipelineNodeKind.Tool,
        positionX: n.position.x || idx * 250,
        positionY: n.position.y || 100,
        configValues: (n.data?.configValues as any) || {},
      }));

      const saveEdges: SavePipelineEdgeItem[] = parsed.edges.map((e) => ({
        id: e.id,
        sourceNodeId: e.source,
        sourcePin: e.sourceHandle || "out",
        targetNodeId: e.target,
        targetPin: e.targetHandle || "in",
      }));

      const localScripts = Object.values(draftNodes).map((d) => ({
        key: d.key,
        fileName: d.fileName,
        fullPath: d.fullPath,
        scriptContent: d.sourceCode || "",
        contentHash: d.contentHash,
        executor: d.executor,
        inputs: (d.inputs || []) as any,
        outputs: (d.outputs || []) as any,
      }));

      const res = await runDraftMutation.mutateAsync({
        data: {
          projectId,
          name: parsed.name || activeDraftPipeline.fileName,
          preferredRunnerId: machineInfo.machineKey,
          localScripts,
          graphData: {
            nodes: saveNodes,
            edges: saveEdges,
          },
        },
      });

      toast.success(`Draft Pipeline Dispatched!`, {
        description: `Status: ${(res as any)?.status || "Running"} (Zero-DB Ephemeral State)`,
      });
    } catch (err: any) {
      toast.error("Failed to run draft pipeline", {
        description: err?.message || "Error during headless draft execution",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rootPath) {
    return (
      <div className="page-container">
        <LocalWorkspaceEmptyState />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background">
      {/* Left Outliner Panel */}
      <LocalWorkspaceOutliner
        onSelectScript={(node) => {
          handleSelectScript(node);
        }}
        onSelectDraft={handleSelectDraft}
        onOpenSyncSheet={() => handleOpenSyncAndReview()}
        onOpenConfig={() => setConfigDialogOpen(true)}
      />

      {/* Main Workbench Area */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Top Workbench Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-card/40 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Laptop className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xs font-semibold tracking-tight text-foreground truncate">
                {activeDraftPipeline ? activeDraftPipeline.fileName : "Local Workbench"}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeDraftPipeline && (
              <>
                <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/60 mr-1">
                  <button
                    onClick={() => setViewMode("visual")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                      viewMode === "visual"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Visual Canvas
                  </button>
                  <button
                    onClick={() => setViewMode("yaml")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all ${
                      viewMode === "yaml"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Raw YAML
                  </button>
                </div>

                {viewMode === "yaml" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={handleSaveRawYaml}
                    className="gap-1.5 text-xs h-8 text-foreground"
                  >
                    Save YAML
                  </Button>
                )}

                <Button
                  size="sm"
                  onPress={handleRunDraft}
                  isDisabled={runDraftMutation.isPending}
                  className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                  <Play className={`h-3.5 w-3.5 ${runDraftMutation.isPending ? "animate-spin" : ""}`} />
                  Run Draft
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => setPublishDialogOpen(true)}
                  className="gap-1.5 text-xs h-8 text-sky-500 hover:text-sky-600 border-sky-500/30"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  Publish to Studio
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="sm"
              onPress={() => handleOpenSyncAndReview()}
              isDisabled={isScanning}
              className="gap-1.5 text-xs h-8"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin text-emerald-500" : ""}`} />
              Sync & Review
            </Button>

            <Button
              variant="outline"
              size="sm"
              onPress={() => setConfigDialogOpen(true)}
              className="gap-1.5 text-xs h-8"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Settings
            </Button>
          </div>
        </div>

        {/* Center Content / Workbench Canvas Area */}
        <div className="flex-1 min-h-0 relative bg-background/50 overflow-hidden">
          {activeDraftPipeline ? (
            viewMode === "yaml" ? (
              <div className="h-full w-full p-4 overflow-auto">
                <div className="h-full max-w-4xl mx-auto flex flex-col gap-2">
                  <textarea
                    value={rawYamlContent}
                    onChange={(e) => setRawYamlContent(e.target.value)}
                    className="flex-1 w-full bg-card rounded-xl border border-border/60 p-4 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-none shadow-sm"
                    placeholder="Declarative pipeline YAML content..."
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : parsedCanvasGraph ? (
              <div className="h-full w-full">
                <PipelineCanvas
                  projectId={projectId}
                  graph={parsedCanvasGraph}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-destructive">
                Failed to parse pipeline YAML for Visual Canvas.
              </div>
            )
          ) : selectedScript ? (
            <div className="max-w-lg mx-auto space-y-3 text-left bg-card/60 p-6 rounded-xl border border-border/60 shadow-sm mt-8">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div className="flex items-center gap-2">
                  <FileCode2 className="h-5 w-5 text-emerald-500" />
                  <span className="font-semibold text-sm text-foreground">{selectedScript.fileName}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {selectedScript.executor}
                </Badge>
              </div>

              <div className="space-y-1 text-xs">
                <p className="text-muted-foreground font-mono text-[11px] truncate">
                  {selectedScript.fullPath}
                </p>
                {selectedScript.description && (
                  <p className="text-muted-foreground mt-2">{selectedScript.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div className="bg-muted/40 p-2.5 rounded border border-border/40">
                  <span className="font-semibold text-foreground block mb-1">
                    Inputs ({selectedScript.inputs?.length || 0})
                  </span>
                  <ul className="space-y-0.5 text-muted-foreground font-mono text-[11px]">
                    {selectedScript.inputs?.map((p: any) => (
                      <li key={p.id || p.name} className="truncate">• {p.label || p.id || p.name}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-muted/40 p-2.5 rounded border border-border/40">
                  <span className="font-semibold text-foreground block mb-1">
                    Outputs ({selectedScript.outputs?.length || 0})
                  </span>
                  <ul className="space-y-0.5 text-muted-foreground font-mono text-[11px]">
                    {selectedScript.outputs?.map((p: any) => (
                      <li key={p.id || p.name} className="truncate">• {p.label || p.id || p.name}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => handleOpenSyncAndReview(selectedScript.key)}
                  className="gap-1.5 text-xs text-emerald-500 hover:text-emerald-600 border-emerald-500/30"
                >
                  <Sliders className="h-3.5 w-3.5" />
                  Inspect AST Pins & Code
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-md mx-auto space-y-3 text-center mt-16">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto">
                <FolderOpen className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Local Workspace Ready
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Select a script from the Outliner to inspect extracted AST pins, or select a .pipeline.yaml
                pipeline to view and edit in the ReactFlow Canvas.
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {draftNodeList.length} local tools in palette
                </Badge>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Config Dialog */}
      <WorkspaceConfigDialog
        projectId={projectId}
        isOpen={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
      />

      {/* Slide-Over Script Review Sheet */}
      <LocalScriptSyncSheet
        isOpen={syncSheetOpen}
        onClose={() => setSyncSheetOpen(false)}
        initialScriptKey={syncSheetInitialKey}
      />

      {/* Publish to Studio Dialog */}
      {parsedCanvasGraph && (
        <PublishToStudioDialog
          projectId={projectId}
          initialName={parsedCanvasGraph.name || "Draft Pipeline"}
          nodes={parsedCanvasGraph.nodes as any}
          edges={parsedCanvasGraph.edges as any}
          isOpen={publishDialogOpen}
          onClose={() => setPublishDialogOpen(false)}
          onPublished={() => {
            setPublishDialogOpen(false);
            toast.success("Pipeline published to Studio Central successfully!");
          }}
        />
      )}
    </div>
  );
}
