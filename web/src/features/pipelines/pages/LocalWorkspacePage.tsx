import { useEffect, useState, useMemo } from "react";
import {
  Save,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  useLocalWorkspaceConfig,
  useLocalPaletteQuery,
  useLocalPipelinesQuery,
  loadLocalPipelineSnapshot,
  saveLocalPipelineSnapshot,
} from "../hooks/workspace";
import { LocalWorkspaceEmptyState } from "../components/workspace/LocalWorkspaceEmptyState";
import { LocalWorkspaceWelcomeState } from "../components/workspace/LocalWorkspaceWelcomeState";
import { LocalWorkspaceOutliner } from "../components/workspace/LocalWorkspaceOutliner";
import { LocalNodeDetailDrawer } from "../components/workspace/LocalNodeDetailDrawer";
import { LocalScriptSyncSheet } from "../components/workspace/LocalScriptSyncSheet";
import { LocalPipelineStorageAdapter } from "../adapters/LocalPipelineStorageAdapter";
import { PipelineWorkspaceProvider } from "../context/PipelineWorkspaceContext";
import { PipelineCanvas } from "../components/canvas/PipelineCanvas";
import { useDialogStore } from "@/stores/dialogStore";
import { pipelineYamlToGraph, graphToPipelineYaml } from "../utils/pipelineDslConverter";
import { useRunDraftPipeline } from "@/gen/endpoints/pipelines/pipelines";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import {
  useStudioQuota,
  useVerifyPipelineExecution,
  useCompletePipelineExecution,
} from "@/features/studios/hooks/useStudioQuota";
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
    config,
    isLoading: isConfigLoading,
    switchRootFolder,
  } = useLocalWorkspaceConfig(projectId);

  const {
    draftNodes,
    reanalyzeSingleScript,
    removeNodeFromPalette,
  } = useLocalPaletteQuery(rootPath, config?.scriptsDir, config?.ignorePatterns);

  const {
    pipelines: scannedDraftPipelines,
    savePipelineDraft,
  } = useLocalPipelinesQuery(rootPath, config?.pipelinesDir);

  const [activeDraftPipelinePath, setActiveDraftPipelinePath] = useState<string | null>(null);

  const activeDraftPipeline = useMemo(() => {
    if (!activeDraftPipelinePath) return null;
    return (
      scannedDraftPipelines.find((p) => p.fullPath === activeDraftPipelinePath) ||
      null
    );
  }, [scannedDraftPipelines, activeDraftPipelinePath]);

  const [syncSheetOpen, setSyncSheetOpen] = useState(false);
  const [syncSheetInitialKey, setSyncSheetInitialKey] = useState<string | undefined>();
  const [selectedScript, setSelectedScript] = useState<LocalDraftNode | null>(null);
  const [isScriptDrawerOpen, setIsScriptDrawerOpen] = useState(false);
  const [isCreatingPipeline, setIsCreatingPipeline] = useState(false);
  const [viewMode, setViewMode] = useState<"visual" | "yaml">("visual");
  const [rawYamlContent, setRawYamlContent] = useState("");
  const [loadedGraph, setLoadedGraph] = useState<ExtendedPipelineGraphDto | null>(null);
  const [graphRevision, setGraphRevision] = useState<number>(0);

  const { studioSlug } = useCurrentStudio();
  const { data: studioQuota } = useStudioQuota(studioSlug);
  const verifyExecutionMutation = useVerifyPipelineExecution(studioSlug);
  const completeExecutionMutation = useCompletePipelineExecution(studioSlug);

  const runDraftMutation = useRunDraftPipeline();

  const pipelineSlug = useMemo(() => {
    if (!activeDraftPipeline) return "";
    return activeDraftPipeline.fileName.replace(/\.(pipeline|component)\.(yaml|yml)$/i, "");
  }, [activeDraftPipeline?.fileName]);

  useEffect(() => {
    if (!activeDraftPipeline || !pipelineSlug || !rootPath) {
      setLoadedGraph(null);
      return;
    }
    setRawYamlContent(activeDraftPipeline.content);

    let isCancelled = false;
    const currentActivePipeline = activeDraftPipeline;
    const currentRootPath = rootPath;

    async function loadGraphData() {
      if (!currentRootPath || !pipelineSlug || !currentActivePipeline) return;

      // 1. Thử load từ snapshot cache trên đĩa (.forgity/snapshots/<pipelineSlug>.snap.json)
      try {
        const snapJson = await loadLocalPipelineSnapshot(currentRootPath, pipelineSlug);
        if (isCancelled) return;

        if (snapJson) {
          const parsedDto = JSON.parse(snapJson) as ExtendedPipelineGraphDto;
          if (parsedDto && Array.isArray(parsedDto.nodes) && parsedDto.nodes.length > 0) {
            setLoadedGraph(parsedDto);
            setGraphRevision((v) => v + 1);
            return;
          }
        }
      } catch (snapErr) {
        console.warn("[LocalWorkspacePage] Snapshot load skipped or unparseable:", snapErr);
      }

      if (isCancelled) return;

      // 2. Fallback: Parse trực tiếp từ file YAML sang Graph DTO
      try {
        const parsed = pipelineYamlToGraph(currentActivePipeline.content);
        const graphDto: ExtendedPipelineGraphDto = {
          id: currentActivePipeline.fullPath,
          name: parsed.name || currentActivePipeline.fileName,
          projectId,
          triggerType: PipelineTriggerType.Manual,
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

            return {
              id: n.id,
              refId: (n.data?.refId as string) || n.id,
              label: (n.data?.label as string) || n.id,
              kind,
              category: isStart || isReturn ? "Flow Control" : matchedScript?.executor || (n.data?.category as string) || "Tool",
              executor: isStart || isReturn ? "server" : matchedScript?.executor || (n.data?.executor as string) || "python",
              position: n.position,
              parentId: n.parentId || null,
              configValues: (n.data?.configValues as any) || {},
              inputs: isReturn
                ? [{ id: "exec_in", label: "Exec", kind: "Exec" as any, isRequired: false }]
                : (matchedScript?.inputs || []),
              outputs: isStart
                ? [{ id: "exec_out", label: "Start", kind: "Exec" as any, isRequired: false }]
                : (matchedScript?.outputs || []),
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

        setLoadedGraph(graphDto);
        setGraphRevision((v) => v + 1);

        // Lưu ngược lại snapshot ban đầu để các lần sau mở tức thì
        void saveLocalPipelineSnapshot(currentRootPath, pipelineSlug, JSON.stringify(graphDto, null, 2));
      } catch (yamlErr) {
        console.error("[LocalWorkspacePage] Failed to parse pipeline YAML:", yamlErr);
        setLoadedGraph(null);
      }
    }

    loadGraphData();

    return () => {
      isCancelled = true;
    };
  }, [activeDraftPipeline?.fullPath, pipelineSlug, rootPath, projectId]);

  const handleSelectScript = (node: LocalDraftNode) => {
    setSelectedScript(node);
    setIsScriptDrawerOpen(true);
  };

  const handleOpenSyncAndReview = (scriptKey?: string) => {
    setSyncSheetInitialKey(scriptKey);
    setSyncSheetOpen(true);
  };

  const handleSelectDraft = (draft: ScannedPipelineYamlItemRust) => {
    setActiveDraftPipelinePath(draft.fullPath);
  };

  const handleSaveRawYaml = async () => {
    if (!activeDraftPipeline || !rootPath) return;
    try {
      await savePipelineDraft({
        filePath: activeDraftPipeline.fullPath,
        content: rawYamlContent,
      });
      // Synchronize with snapshot: merge updated YAML nodes/edges while preserving existing coordinates
      if (pipelineSlug) {
        try {
          const parsed = pipelineYamlToGraph(rawYamlContent);
          const currentSnapStr = await loadLocalPipelineSnapshot(rootPath, pipelineSlug);
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

          await saveLocalPipelineSnapshot(rootPath, pipelineSlug, JSON.stringify(updatedSnapDto, null, 2));
          setLoadedGraph(updatedSnapDto);
          setGraphRevision((v) => v + 1);
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

    // Check execution credits gate
    if (studioQuota && studioQuota.executionCreditsRemaining <= 0) {
      useDialogStore.getState().openDialog("upgrade-plan", { quota: studioQuota });
      toast.error("Execution limit reached", {
        description: "Your 50 free preview runs have been exhausted. Please upgrade to Indie Pro.",
      });
      return;
    }

    try {
      if (studioSlug) {
        try {
          await verifyExecutionMutation.mutateAsync();
        } catch (verifyErr: any) {
          useDialogStore.getState().openDialog("upgrade-plan", { quota: studioQuota });
          toast.error("Execution limit reached", {
            description: verifyErr?.message || "Credits exhausted. Please upgrade to Indie Pro.",
          });
          return;
        }
      }

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

      // Deduct 1 credit upon successful dispatch
      if (studioSlug) {
        completeExecutionMutation.mutate(1);
      }

      toast.success(`Draft Pipeline Dispatched!`, {
        description: `Status: ${(res as any)?.status || "Running"} (Zero-DB Ephemeral State)`,
      });
    } catch (err: any) {
      toast.error("Failed to run draft pipeline", {
        description: err?.message || "Error during headless draft execution",
      });
    }
  };

  const storageAdapter = useMemo(() => {
    return new LocalPipelineStorageAdapter({
      rootPath: rootPath || "",
      pipelineSlug,
      filePath: activeDraftPipeline?.fullPath || "",
      onRunDraft: handleRunDraft,
    });
  }, [rootPath, pipelineSlug, activeDraftPipeline?.fullPath]);

  if (isConfigLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!rootPath) {
    return (
      <div className="page-container">
        <LocalWorkspaceEmptyState onOpenWorkspaceRoot={switchRootFolder} />
      </div>
    );
  }

  return (
    <PipelineWorkspaceProvider
      mode="local"
      projectId={projectId}
      rootPath={rootPath}
      storage={storageAdapter}
    >
      <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background">
      {/* Left Outliner Panel */}
      <LocalWorkspaceOutliner
        projectId={projectId}
        activeDraftPipeline={activeDraftPipeline}
        onSelectScript={(node) => {
          handleSelectScript(node);
        }}
        onSelectDraft={handleSelectDraft}
        onOpenSyncSheet={() => handleOpenSyncAndReview()}
        onOpenConfig={() => useDialogStore.getState().openDialog("workspace-config", { projectId })}
        isCreatingPipelineExternal={isCreatingPipeline}
        onCreatingPipelineChange={setIsCreatingPipeline}
        onOpenPullDialog={() => useDialogStore.getState().openDialog("workspace-pull-studio", { projectId })}
        onOpenUnpackDialog={() => useDialogStore.getState().openDialog("workspace-unpack-package")}
      />

      {/* Main Workbench Area */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Center Content / Workbench Canvas Area */}
        <div className="flex-1 min-h-0 relative bg-background/50 overflow-hidden">
          {activeDraftPipeline ? (
            viewMode === "yaml" ? (
              <div className="h-full w-full flex flex-col overflow-hidden bg-background">
                {/* YAML Sub-header */}
                <div className="flex h-14 w-full items-center justify-between border-b border-border/80 bg-background px-4 shadow-sm z-30 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {activeDraftPipeline.fileName}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      YAML DSL
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/60">
                      <button
                        type="button"
                        onClick={() => setViewMode("visual")}
                        className="px-2.5 py-1 text-xs rounded-md font-medium text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                      >
                        Canvas
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode("yaml")}
                        className="px-2.5 py-1 text-xs rounded-md font-medium bg-background text-foreground shadow-xs font-semibold transition-all cursor-pointer"
                      >
                        YAML
                      </button>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={handleSaveRawYaml}
                      className="gap-1.5 text-xs h-8 text-foreground"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save YAML
                    </Button>
                  </div>
                </div>

                <div className="flex-1 p-4 overflow-hidden flex flex-col">
                  <textarea
                    value={rawYamlContent}
                    onChange={(e) => setRawYamlContent(e.target.value)}
                    className="flex-1 w-full bg-card rounded-xl border border-border/60 p-4 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary leading-relaxed resize-none shadow-sm"
                    placeholder="Declarative pipeline YAML content..."
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : loadedGraph ? (
              <div className="h-full w-full">
                <PipelineCanvas
                  key={`${activeDraftPipeline.fullPath}:${graphRevision}`}
                  projectId={projectId}
                  rootPath={rootPath}
                  graph={loadedGraph}
                  storage={storageAdapter}
                  pipelineKind={activeDraftPipeline.pipelineKind || "master"}
                  componentExecutor={activeDraftPipeline.executor || undefined}
                  viewMode={viewMode}
                  onToggleViewMode={async (mode) => {
                    if (mode === "yaml" && pipelineSlug && rootPath) {
                      const snapJson = await loadLocalPipelineSnapshot(rootPath, pipelineSlug);
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
                    setViewMode(mode);
                  }}
                  onOpenPublishModal={() => useDialogStore.getState().openDialog("workspace-publish-studio" as any, { graph: loadedGraph })}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-destructive">
                Failed to parse pipeline YAML for Visual Canvas.
              </div>
            )
          ) : (
            <LocalWorkspaceWelcomeState
              rootPath={rootPath}
              onCreatePipeline={() => setIsCreatingPipeline(true)}
              onPullFromStudio={() => useDialogStore.getState().openDialog("workspace-pull-studio", { projectId })}
              onUnpackPackage={() => useDialogStore.getState().openDialog("workspace-unpack-package")}
            />
          )}
        </div>
      </div>

      {/* Slide-Over Script Inspector Drawer */}
      <LocalNodeDetailDrawer
        node={selectedScript}
        isOpen={isScriptDrawerOpen}
        onClose={() => setIsScriptDrawerOpen(false)}
        hasActivePipeline={Boolean(activeDraftPipeline)}
        onReanalyzeNode={async (node) => {
          const res = await reanalyzeSingleScript(node.key);
          if (res?.draftNodes[node.key]) {
            setSelectedScript(res.draftNodes[node.key]);
          }
        }}
        onRemoveNode={async (nodeKey) => {
          await removeNodeFromPalette(nodeKey);
          setIsScriptDrawerOpen(false);
          setSelectedScript(null);
        }}
      />

      {/* Slide-Over Script Review Sheet */}
      <LocalScriptSyncSheet
        rootPath={rootPath}
        scriptsDir={config?.scriptsDir}
        customIgnores={config?.ignorePatterns}
        isOpen={syncSheetOpen}
        onClose={() => setSyncSheetOpen(false)}
        initialScriptKey={syncSheetInitialKey}
      />
    </div>
  </PipelineWorkspaceProvider>
  );
}
