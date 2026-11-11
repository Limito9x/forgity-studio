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
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Loader2,
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
import { PipelineCanvas, type CanvasValidateControls } from "../components/canvas/PipelineCanvas";
import { pipelineYamlToGraph, graphToPipelineYaml } from "../utils/pipelineDslConverter";
import { useRunDraftPipeline } from "@/gen/endpoints/pipelines/pipelines";
import { getLocalMachineInfo } from "@/lib/platform/filePickerStrategy";
import { PipelineTriggerType } from "@/gen/model/pipelineTriggerType";
import type { LocalDraftNode, ScannedPipelineYamlItemRust } from "../types/workspaceConfig";
import type { ExtendedPipelineGraphDto, SavePipelineNodeItem, SavePipelineEdgeItem } from "../hooks/usePipelineGraph";
import { PipelineNodeKind } from "../hooks/usePipelineGraph";

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
    savePipelineSnapshotOnDisk,
    loadPipelineSnapshotFromDisk,
  } = useLocalWorkspaceStore();

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [syncSheetOpen, setSyncSheetOpen] = useState(false);
  const [syncSheetInitialKey, setSyncSheetInitialKey] = useState<string | undefined>();
  const [selectedScript, setSelectedScript] = useState<LocalDraftNode | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "yaml">("visual");
  const [rawYamlContent, setRawYamlContent] = useState("");
  const [cachedSnapshotGraph, setCachedSnapshotGraph] = useState<ExtendedPipelineGraphDto | null>(null);
  const [validateControls, setValidateControls] = useState<CanvasValidateControls | null>(null);

  const runDraftMutation = useRunDraftPipeline();

  useEffect(() => {
    if (projectId) {
      initWorkspace(projectId).then(() => {
        scanDraftPipelines();
      });
    }
  }, [projectId, initWorkspace, scanDraftPipelines]);

  const pipelineSlug = useMemo(() => {
    if (!activeDraftPipeline) return "";
    return activeDraftPipeline.fileName.replace(/\.pipeline\.(yaml|yml)$/, "");
  }, [activeDraftPipeline?.fileName]);

  useEffect(() => {
    if (!activeDraftPipeline || !pipelineSlug) {
      setCachedSnapshotGraph(null);
      return;
    }
    setRawYamlContent(activeDraftPipeline.content);

    // Try loading snapshot from .forgity/snapshots/<pipelineSlug>.snap.json
    let isCancelled = false;
    loadPipelineSnapshotFromDisk(pipelineSlug).then((snapJson) => {
      if (isCancelled) return;
      if (snapJson) {
        try {
          const parsedDto = JSON.parse(snapJson) as ExtendedPipelineGraphDto;
          setCachedSnapshotGraph(parsedDto);
          return;
        } catch (e) {
          console.warn("[LocalWorkspacePage] Failed to parse snapshot json:", e);
        }
      }
      setCachedSnapshotGraph(null);
    });

    return () => {
      isCancelled = true;
    };
  }, [activeDraftPipeline?.fullPath, pipelineSlug, loadPipelineSnapshotFromDisk]);

  const draftNodeList = Object.values(draftNodes);

  // Parse active draft YAML into ExtendedPipelineGraphDto for PipelineCanvas
  // YAML is the Single Source of Truth for nodes and edges; snapshot supplies cached coordinates & sizes.
  const parsedCanvasGraph = useMemo<ExtendedPipelineGraphDto | null>(() => {
    if (!activeDraftPipeline?.content) return null;
    try {
      const parsed = pipelineYamlToGraph(activeDraftPipeline.content);

      // Position, size and custom config lookup map from snapshot if available
      const snapNodeMap = new Map<string, any>();
      if (cachedSnapshotGraph?.nodes) {
        for (const sn of cachedSnapshotGraph.nodes) {
          snapNodeMap.set(sn.id, sn);
        }
      }

      const graphDto: ExtendedPipelineGraphDto = {
        id: activeDraftPipeline.fullPath,
        name: parsed.name || activeDraftPipeline.fileName,
        projectId,
        triggerType: cachedSnapshotGraph?.triggerType ?? PipelineTriggerType.Manual,
        nodes: parsed.nodes.map((n) => {
          const refIdLower = String(n.data?.refId || n.id).toLowerCase();
          const isStart = refIdLower === "start" || refIdLower === "beginexecute";
          const isReturn = refIdLower === "return" || refIdLower === "endexecute";
          const isStage = n.type === "scopeContainer";

          let kind: any = PipelineNodeKind.Tool;
          if (isStart) kind = PipelineNodeKind.Start;
          else if (isReturn) kind = PipelineNodeKind.Return;
          else if (isStage) kind = PipelineNodeKind.Container;
          else if (n.data?.isLocalDraft) kind = PipelineNodeKind.Custom;

          const matchedScript = Object.values(draftNodes).find(
            (d) => d.key === n.data?.refId || `local:${d.key}` === n.data?.refId
          );

          const snapNode = snapNodeMap.get(n.id);

          return {
            id: n.id,
            refId: (n.data?.refId as string) || n.id,
            label: (n.data?.label as string) || n.id,
            kind,
            category: isStart || isReturn ? "Flow Control" : matchedScript?.executor || (n.data?.category as string) || "Tool",
            executor: isStart || isReturn ? "server" : matchedScript?.executor || (n.data?.executor as string) || "python",
            position: snapNode?.position || n.position,
            parentId: n.parentId || null,
            size: snapNode?.size,
            configValues: (n.data?.configValues as any) || snapNode?.configValues || {},
            inputs: isReturn
              ? [{ id: "exec_in", label: "Exec", kind: "Exec" as any, isRequired: false }]
              : snapNode?.inputs?.length ? snapNode.inputs : (matchedScript?.inputs || []),
            outputs: isStart
              ? [{ id: "exec_out", label: "Start", kind: "Exec" as any, isRequired: false }]
              : snapNode?.outputs?.length ? snapNode.outputs : (matchedScript?.outputs || []),
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
        parameters: cachedSnapshotGraph?.parameters || [],
      };
      return graphDto;
    } catch (err: any) {
      console.warn("[LocalWorkspacePage] Failed to parse pipeline YAML:", err);
      return null;
    }
  }, [cachedSnapshotGraph, activeDraftPipeline, projectId, draftNodes]);

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
      // Synchronize with snapshot: merge updated YAML nodes/edges while preserving existing coordinates
      if (pipelineSlug) {
        try {
          const parsed = pipelineYamlToGraph(rawYamlContent);
          const currentSnapStr = await loadPipelineSnapshotFromDisk(pipelineSlug);
          const currentSnap = currentSnapStr ? (JSON.parse(currentSnapStr) as ExtendedPipelineGraphDto) : null;
          const posMap = new Map<string, { x: number; y: number }>();
          const sizeMap = new Map<string, { width: number; height: number }>();
          if (currentSnap?.nodes) {
            for (const sn of currentSnap.nodes) {
              if (sn.position) posMap.set(sn.id, sn.position);
              if (sn.size) sizeMap.set(sn.id, sn.size);
            }
          }

          const updatedNodes = parsed.nodes.map((n, idx) => {
            const existingPos = posMap.get(n.id);
            const existingSize = sizeMap.get(n.id);
            const refIdLower = String(n.data?.refId || n.id).toLowerCase();
            const isStart = refIdLower === "start" || refIdLower === "beginexecute";
            const isReturn = refIdLower === "return" || refIdLower === "endexecute";
            const isStage = n.type === "scopeContainer";

            let kind: any = PipelineNodeKind.Tool;
            if (isStart) kind = PipelineNodeKind.Start;
            else if (isReturn) kind = PipelineNodeKind.Return;
            else if (isStage) kind = PipelineNodeKind.Container;
            else if (n.data?.isLocalDraft) kind = PipelineNodeKind.Custom;

            const matchedScript = Object.values(draftNodes).find(
              (d) => d.key === n.data?.refId || `local:${d.key}` === n.data?.refId
            );

            return {
              id: n.id,
              refId: (n.data?.refId as string) || n.id,
              label: (n.data?.label as string) || n.id,
              kind,
              category: isStart || isReturn ? "Flow Control" : matchedScript?.executor || (n.data?.category as string) || "Tool",
              executor: isStart || isReturn ? "server" : matchedScript?.executor || (n.data?.executor as string) || "python",
              position: existingPos || n.position || { x: 100 + idx * 250, y: 100 },
              parentId: n.parentId || null,
              size: existingSize || { width: 240, height: 120 },
              configValues: (n.data?.configValues as any) || {},
              inputs: matchedScript?.inputs || [],
              outputs: matchedScript?.outputs || [],
              metadata: {
                isLocalDraft: n.data?.isLocalDraft,
                label: n.data?.label,
              },
            };
          });

          const updatedEdges = parsed.edges.map((e) => ({
            id: e.id,
            sourceNodeId: e.source,
            sourcePin: e.sourceHandle || "out",
            targetNodeId: e.target,
            targetPin: e.targetHandle || "in",
          }));

          const updatedSnapDto: ExtendedPipelineGraphDto = {
            id: activeDraftPipeline.fullPath,
            name: parsed.name || activeDraftPipeline.fileName,
            projectId,
            triggerType: PipelineTriggerType.Manual,
            nodes: updatedNodes,
            edges: updatedEdges,
            parameters: currentSnap?.parameters || [],
          };

          await savePipelineSnapshotOnDisk(pipelineSlug, JSON.stringify(updatedSnapDto, null, 2));
          setCachedSnapshotGraph(updatedSnapDto);
        } catch (snapErr) {
          console.warn("[LocalWorkspacePage] Could not update snapshot from raw YAML:", snapErr);
        }
      }
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
                    onClick={async () => {
                      if (pipelineSlug) {
                        const snapJson = await loadPipelineSnapshotFromDisk(pipelineSlug);
                        if (snapJson) {
                          try {
                            const parsedDto = JSON.parse(snapJson) as ExtendedPipelineGraphDto;
                            const yamlStr = graphToPipelineYaml(
                              parsedDto.name,
                              parsedDto.nodes as any,
                              parsedDto.edges as any
                            );
                            setRawYamlContent(yamlStr);
                          } catch (e) {
                            console.warn("Failed to generate raw yaml from current snapshot", e);
                          }
                        }
                      }
                      setViewMode("yaml");
                    }}
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

                {viewMode === "visual" && validateControls && (
                  <div className="flex items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => validateControls.validate()}
                      isDisabled={validateControls.isValidating || runDraftMutation.isPending}
                      className={`gap-1.5 text-xs h-8 ${
                        validateControls.errorCount > 0
                          ? "border-destructive/50 text-destructive hover:bg-destructive/10"
                          : validateControls.warningCount > 0
                            ? "border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                            : ""
                      }`}
                    >
                      {validateControls.isValidating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : validateControls.errorCount > 0 ? (
                        <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                      ) : validateControls.warningCount > 0 ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      <span>Validate</span>
                      {validateControls.errorCount > 0 && (
                        <Badge variant="destructive" className="h-4 px-1 py-0 text-[9px] font-mono">
                          {validateControls.errorCount}
                        </Badge>
                      )}
                      {validateControls.errorCount === 0 && validateControls.warningCount > 0 && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 py-0 text-[9px] font-mono border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                        >
                          {validateControls.warningCount}
                        </Badge>
                      )}
                      {validateControls.isStale && (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" title="Draft changed" />
                      )}
                    </Button>
                    <Button
                      variant={validateControls.isDiagnosticsOpen ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-6 ml-0.5 px-0 text-muted-foreground hover:text-foreground"
                      onPress={validateControls.toggleDiagnostics}
                      aria-label="Toggle diagnostics list"
                    >
                      <span className="text-[10px] font-mono">▼</span>
                    </Button>
                  </div>
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
              <div className="h-full w-full p-4 overflow-hidden flex flex-col">
                <div className="h-full w-full flex flex-col gap-2">
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
                  isLocalMode={true}
                  onRegisterValidateControls={setValidateControls}
                  onSaveLocalDraft={async (yamlContent) => {
                    if (activeDraftPipeline) {
                      await savePipelineDraft(activeDraftPipeline.fullPath, yamlContent);
                    }
                  }}
                  onSaveLocalSnapshot={async (snapshotDto) => {
                    if (pipelineSlug) {
                      await savePipelineSnapshotOnDisk(pipelineSlug, JSON.stringify(snapshotDto, null, 2));
                    }
                  }}
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
