import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  useLocalNodeContractsQuery,
  loadLocalPipelineSnapshot,
  saveLocalPipelineSnapshot,
} from "../hooks/workspace";
import type { NodePaletteItemDto, StructDefinitionDto } from "@/features/pipelines/types/pipelineGraphTypes";
import type { PipelineWorkspaceContract } from "../types/pipelineWorkspaceContract";
import { LocalWorkspaceEmptyState } from "../components/workspace/LocalWorkspaceEmptyState";
import { LocalWorkspaceWelcomeState } from "../components/workspace/LocalWorkspaceWelcomeState";
import { LocalWorkspaceOutliner } from "../components/workspace/LocalWorkspaceOutliner";
import { WorkspaceTabBar } from "../components/workspace/WorkspaceTabBar";
import { LocalConstantsManagerPage } from "../components/workspace/LocalConstantsManagerPage";
import { LocalNodePaletteWorkbench } from "../components/workspace/LocalNodePaletteWorkbench";
import { useWorkspaceTabsStore } from "../stores/useWorkspaceTabsStore";
import {
  useWorkspaceUiPrefsStore,
  useProjectUiPrefs,
} from "../stores/useWorkspaceUiPrefsStore";
import { LocalNodeDetailDrawer } from "../components/workspace/LocalNodeDetailDrawer";
import { PublishCloudPipelineDialog } from "../dialogs/PublishCloudPipelineDialog";
import { LocalPipelineStorageAdapter } from "../adapters/LocalPipelineStorageAdapter";
import { PipelineWorkspaceProvider } from "../context/PipelineWorkspaceContext";
import { PipelineCanvas } from "../components/canvas/PipelineCanvas";
import { useDialogStore } from "@/stores/dialogStore";
import { pipelineYamlToGraph, graphToPipelineYaml } from "../utils/pipelineDslConverter";
import { validateLocalPipelineGraph } from "../utils/localGraphValidator";
import { PipelineTriggerType } from "@/features/pipelines/types/pipelineGraphTypes";
import type {
  LocalDraftNode,
  LocalStructDefinition,
  ScannedPipelineYamlItemRust,
} from "../types/workspaceConfig";
import type { ExtendedPipelineGraphDto } from "../hooks/usePipelineGraph";
import { PipelineNodeKind } from "../hooks/usePipelineGraph";

function localStructsToCatalogue(structs: LocalStructDefinition[]): StructDefinitionDto[] {
  return structs.map((s) => ({
    refId: s.slug,
    name: s.displayName || s.slug,
    structType: s.slug,
    label: s.displayName || s.slug,
    outputPins: s.fields.map((f) => ({
      id: f.name,
      name: f.name,
      direction: "Output",
      label: f.label || f.name,
      kind: "Data" as any,
      primitiveType: (f.type === "Struct" ? "EntityRef" : f.type) as any,
      cardinality: (f.cardinality || "Single") as any,
      structType: f.structType,
      defaultValue: f.defaultValue,
    })),
  }));
}

interface LocalWorkspacePageProps {
  projectId: string;
  explicitRootPath?: string | null;
}

export function LocalWorkspacePage({ projectId, explicitRootPath }: LocalWorkspacePageProps) {
  const queryClient = useQueryClient();
  const {
    rootPath,
    config,
    isLoading: isConfigLoading,
    switchRootFolder,
  } = useLocalWorkspaceConfig(projectId, explicitRootPath);

  const {
    draftNodes,
    localStructs,
    isScanning,
    scanAndSyncScripts,
    reanalyzeSingleScript,
    removeNodeFromPalette,
  } = useLocalPaletteQuery(rootPath, config?.scriptsDir, config?.ignorePatterns);

  const handleSyncScripts = useCallback(async () => {
    await scanAndSyncScripts();
    if (rootPath) {
      await queryClient.invalidateQueries({ queryKey: ["local-node-contracts", rootPath] });
      await queryClient.invalidateQueries({ queryKey: ["local-workspace", "pipelines", rootPath] });
    }
  }, [scanAndSyncScripts, rootPath, queryClient]);

  const {
    pipelines: scannedDraftPipelines,
    savePipelineDraft,
  } = useLocalPipelinesQuery(rootPath, config?.pipelinesDir);

  const {
    data: nodeContractItems,
    isLoading: isLoadingNodeContracts,
  } = useLocalNodeContractsQuery(rootPath);

  const {
    getProjectState,
    openPipelineTab,
    openSingletonTab,
    closeTab,
    setActiveTab,
    paletteScanRequest,
    paletteInitialScriptKey,
    requestPaletteScan,
  } = useWorkspaceTabsStore();

  const uiPrefs = useProjectUiPrefs(projectId);
  const toggleSidebar = useWorkspaceUiPrefsStore((s) => s.toggleSidebar);
  const setCanvasViewMode = useWorkspaceUiPrefsStore((s) => s.setCanvasViewMode);

  const workbenchState = getProjectState(projectId);
  const activeTab = useMemo(
    () => workbenchState.tabs.find((t) => t.id === workbenchState.activeTabId) || null,
    [workbenchState.tabs, workbenchState.activeTabId],
  );

  const [activeDraftPipelinePath, setActiveDraftPipelinePath] = useState<string | null>(null);

  // Sync activeDraftPipelinePath with active pipeline tab
  useEffect(() => {
    if (activeTab?.kind === "pipeline" && activeTab.filePath) {
      setActiveDraftPipelinePath(activeTab.filePath);
    }
  }, [activeTab?.id, activeTab?.kind, activeTab?.filePath]);

  // Ctrl+B shortcut to toggle Sidebar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar(projectId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projectId, toggleSidebar]);

  const activeDraftPipeline = useMemo(() => {
    if (!activeDraftPipelinePath) return null;
    return (
      scannedDraftPipelines.find((p) => p.fullPath === activeDraftPipelinePath) ||
      null
    );
  }, [scannedDraftPipelines, activeDraftPipelinePath]);

  const [selectedScript, setSelectedScript] = useState<LocalDraftNode | null>(null);
  const [isScriptDrawerOpen, setIsScriptDrawerOpen] = useState(false);
  const [isCreatingPipeline, setIsCreatingPipeline] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishPayload, setPublishPayload] = useState<{
    dagBundleJson: Record<string, any>;
    contractsJson: Record<string, any>;
    scripts: Array<{
      key: string;
      executor: string;
      sourceCode: string;
      requirementsJson?: string[];
    }>;
  } | null>(null);

  const handleOpenPublishModal = async () => {
    if (!loadedGraph) {
      setPublishDialogOpen(true);
      return;
    }

    let bundle: Record<string, any> = {};
    if (rootPath) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const yamlStr = graphToPipelineYaml(
          loadedGraph.name,
          loadedGraph.nodes as any,
          loadedGraph.edges as any
        );
        bundle = await invoke<Record<string, any>>("build_publish_bundle_json", {
          rootPath,
          pipelineYamlContent: yamlStr,
          pipelineKind: activeDraftPipeline?.pipelineKind || "master",
        });
      } catch (err) {
        console.warn("build_publish_bundle_json fallback:", err);
      }
    }

    // Collect constant keys used across master + components + bundle
    const usedConstantKeys = new Set<string>(
      Object.keys((bundle.constants as Record<string, any>) || {})
    );
    const collectConstRefs = (nodesList: any[] | undefined) => {
      if (!Array.isArray(nodesList)) return;
      for (const n of nodesList) {
        const refId = String(n?.refId || "");
        if (refId.startsWith("local:constant:")) {
          usedConstantKeys.add(refId.slice("local:constant:".length));
        }
      }
    };
    collectConstRefs(loadedGraph.nodes as any[]);
    for (const comp of Object.values((bundle.components as Record<string, any>) || {})) {
      collectConstRefs(comp?.nodes);
    }

    const sanitizedNodes = (localPaletteItems || []).map((item: any) => {
      const caps = item?.capabilities || {};
      const isConst =
        Boolean(caps.isConstantNode) ||
        String(item?.category || "").toLowerCase() === "constants" ||
        String(item?.key || "").startsWith("local:constant:");
      if (!isConst) return item;
      return {
        ...item,
        capabilities: {
          ...caps,
          resolvedValue: null,
          resolvedUnrealPath: null,
        },
        outputs: Array.isArray(item.outputs)
          ? item.outputs.map((o: any) => ({ ...o, defaultValue: null }))
          : [],
      };
    });

    const constantsContract: any[] = [];
    const seenConst = new Set<string>();
    for (const item of sanitizedNodes) {
      const caps = item?.capabilities || {};
      const isConst =
        Boolean(caps.isConstantNode) ||
        String(item?.category || "").toLowerCase() === "constants" ||
        String(item?.key || "").startsWith("local:constant:");
      if (!isConst) continue;
      const constKey = String(caps.constantKey || item?.name || "");
      if (!constKey || seenConst.has(constKey)) continue;
      if (usedConstantKeys.size > 0 && !usedConstantKeys.has(constKey)) continue;
      seenConst.add(constKey);
      constantsContract.push({
        key: constKey,
        label: String(item?.label || constKey).replace(/^Constant:\s*/i, ""),
        dataType: String(caps.dataType || "String"),
        scope: caps.scope || "Local",
        description: item?.description || undefined,
        isRequired: true,
      });
    }

    const scriptsArr = Object.entries((bundle.scripts as Record<string, any>) || {}).map(
      ([key, s]) => ({
        key,
        executor: String(s?.executor || "python"),
        sourceCode: String(s?.sourceCode || s?.source_code || ""),
        requirementsJson: Array.isArray(s?.requirements) ? s.requirements : [],
      })
    );

    setPublishPayload({
      dagBundleJson: {
        ...bundle,
        rootPipeline: loadedGraph,
        constants: {}, // strip personal constant values from published bundle
      },
      contractsJson: {
        nodes: sanitizedNodes,
        constants: constantsContract,
      },
      scripts: scriptsArr,
    });
    setPublishDialogOpen(true);
  };
  const viewMode = uiPrefs.canvasViewMode;
  const setViewMode = (mode: "visual" | "yaml") => setCanvasViewMode(projectId, mode);
  const [rawYamlContent, setRawYamlContent] = useState("");
  const [loadedGraph, setLoadedGraph] = useState<ExtendedPipelineGraphDto | null>(null);
  const [isLoadingGraph, setIsLoadingGraph] = useState(false);
  const [graphRevision, setGraphRevision] = useState<number>(0);

  const pipelineSlug = useMemo(() => {
    if (!activeDraftPipeline) return "";
    return activeDraftPipeline.fileName.replace(/\.(pipeline|component)\.(yaml|yml)$/i, "");
  }, [activeDraftPipeline?.fileName]);

  useEffect(() => {
    if (!activeDraftPipeline || !pipelineSlug || !rootPath) {
      setLoadedGraph(null);
      setIsLoadingGraph(false);
      return;
    }
    setRawYamlContent(activeDraftPipeline.content);
    setLoadedGraph(null);
    setIsLoadingGraph(true);

    let isCancelled = false;
    const currentActivePipeline = activeDraftPipeline;
    const currentRootPath = rootPath;

    async function loadGraphData() {
      if (!currentRootPath || !pipelineSlug || !currentActivePipeline) return;

      try {
        // 1. Thử load từ snapshot cache trên đĩa (.forgity/snapshots/<pipelineSlug>.snap.json)
        try {
          const snapJson = await loadLocalPipelineSnapshot(currentRootPath, pipelineSlug);
          if (isCancelled) return;

          if (snapJson) {
            const parsedDto = JSON.parse(snapJson) as ExtendedPipelineGraphDto;
            if (parsedDto && Array.isArray(parsedDto.nodes) && parsedDto.nodes.length > 0) {
              // Ensure loaded graph ID matches the active draft pipeline path in current workspace
              parsedDto.id = currentActivePipeline.fullPath;
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

              let kind: any = PipelineNodeKind.Tool;
              if (isStart) kind = PipelineNodeKind.Start;
              else if (isReturn) kind = PipelineNodeKind.Return;
              else if (n.data?.isLocalDraft) kind = PipelineNodeKind.Custom;

              const matchedScript = Object.values(draftNodes).find(
                (d) => d.key === n.data?.refId || `local:${d.key}` === n.data?.refId
              );
              const matchedContract = (nodeContractItems || []).find(
                (c) => String(c.key).toLowerCase() === refIdLower
              );

              return {
                id: n.id,
                refId: (n.data?.refId as string) || n.id,
                label: (n.data?.label as string) || matchedContract?.label || n.id,
                kind,
                category:
                  isStart || isReturn
                    ? "Flow Control"
                    : matchedContract?.category ||
                      matchedScript?.executor ||
                      (n.data?.category as string) ||
                      "Tool",
                executor:
                  isStart || isReturn
                    ? "server"
                    : matchedContract?.executor ||
                      matchedScript?.executor ||
                      (n.data?.executor as string) ||
                      "python",
                position: n.position,
                configValues: (n.data?.configValues as any) || {},
                inputs: isReturn
                  ? [{ id: "exec_in", label: "Exec", kind: "Exec" as any, isRequired: false }]
                  : (matchedContract?.inputs as any) || matchedScript?.inputs || [],
                outputs: isStart
                  ? [{ id: "exec_out", label: "Start", kind: "Exec" as any, isRequired: false }]
                  : (matchedContract?.outputs as any) || matchedScript?.outputs || [],
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

          if (isCancelled) return;
          setLoadedGraph(graphDto);
          setGraphRevision((v) => v + 1);

          // Lưu ngược lại snapshot ban đầu để các lần sau mở tức thì
          void saveLocalPipelineSnapshot(currentRootPath, pipelineSlug, JSON.stringify(graphDto, null, 2));
        } catch (yamlErr) {
          console.error("[LocalWorkspacePage] Failed to parse pipeline YAML:", yamlErr);
          if (!isCancelled) {
            setLoadedGraph(null);
          }
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingGraph(false);
        }
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

            let kind: any = PipelineNodeKind.Tool;
            if (isStart) kind = PipelineNodeKind.Start;
            else if (isReturn) kind = PipelineNodeKind.Return;
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

  const handleRunDraft = async (runtimeInputs?: Record<string, any>) => {
    if (!activeDraftPipeline || !rootPath) return;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const lowerName = activeDraftPipeline.fileName.toLowerCase();
      const pipelineKind =
        lowerName.endsWith(".component.yaml") || lowerName.endsWith(".component.yml")
          ? "component"
          : "master";

      // Prefer generating YAML from the active graph snapshot so Run Draft always executes
      // the latest canvas state rather than stale disk YAML.
      let yamlToRun = activeDraftPipeline.content;
      if (pipelineSlug) {
        try {
          const snapJson = await loadLocalPipelineSnapshot(rootPath, pipelineSlug);
          if (snapJson) {
            const parsedDto = JSON.parse(snapJson) as ExtendedPipelineGraphDto;
            if (parsedDto && Array.isArray(parsedDto.nodes) && parsedDto.nodes.length > 0) {
              yamlToRun = graphToPipelineYaml(
                parsedDto.name,
                parsedDto.nodes as any,
                parsedDto.edges as any,
              );
            }
          }
        } catch (snapErr) {
          console.warn("[LocalWorkspacePage] Fallback to disk YAML for run:", snapErr);
        }
      }

      const res = await invoke<{ runId: string; runnerPath: string }>(
        "run_local_pipeline",
        {
          rootPath,
          pipelineYamlContent: yamlToRun,
          pipelineKind,
          runtimeInputs: runtimeInputs || {},
        },
      );

      // Invalidate library queries to refresh any quota deducted by runner preflight
      queryClient.invalidateQueries({ queryKey: ["my-library"] });

      toast.success("Local Pipeline Started!", {
        description: `Run ID: ${res.runId} (${pipelineKind})`,
      });
    } catch (err: any) {
      toast.error("Failed to run local pipeline", {
        description: err?.message || String(err) || "Error during local runner execution",
      });
    }
  };

  const handleRunDraftRef = useRef(handleRunDraft);
  handleRunDraftRef.current = handleRunDraft;

  const storageAdapter = useMemo(() => {
    return new LocalPipelineStorageAdapter({
      rootPath: rootPath || "",
      pipelineSlug,
      filePath: activeDraftPipeline?.fullPath || "",
      pipelineKind: activeDraftPipeline?.pipelineKind === "component" ? "component" : "master",
      executor: activeDraftPipeline?.executor || undefined,
      onRunDraft: (runtimeInputs) => handleRunDraftRef.current(runtimeInputs),
      onDraftSaved: (savedGraph) => {
        setLoadedGraph(savedGraph);
        if (rootPath) {
          queryClient.invalidateQueries({ queryKey: ["local-node-contracts", rootPath] });
        }
      },
    });
  }, [
    rootPath,
    pipelineSlug,
    activeDraftPipeline?.fullPath,
    activeDraftPipeline?.pipelineKind,
    activeDraftPipeline?.executor,
    queryClient,
  ]);

  const localStructCatalogue = useMemo(
    () => localStructsToCatalogue(localStructs || []),
    [localStructs]
  );

  const localPaletteItems = useMemo<NodePaletteItemDto[]>(() => {
    const items: NodePaletteItemDto[] = [];

    if (draftNodes) {
      for (const draft of Object.values(draftNodes)) {
        items.push({
          refId: `local:${draft.key}`,
          name: draft.suggestedLabel || draft.suggestedName || draft.fileName,
          kind: PipelineNodeKind.Custom,
          key: `local:${draft.key}`,
          label: draft.suggestedLabel || draft.suggestedName || draft.fileName,
          category: "Local Scripts",
          source: "LocalDraft" as any,
          executor: draft.executor,
          inputs: (draft.inputs || []) as any,
          outputs: (draft.outputs || []) as any,
          description: draft.description || draft.fullPath,
          id: `local:${draft.key}`,
          isVisibleInPalette: true,
        });
      }
    }

    if (nodeContractItems && nodeContractItems.length > 0) {
      items.push(...nodeContractItems);
    }

    return items;
  }, [draftNodes, nodeContractItems]);

  const handleCancelLocalExecution = useCallback(async (executionId: string) => {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("cancel_local_pipeline", { runId: executionId });
  }, []);

  const handleValidateLocalGraph = useCallback(
    async (_snapshot: Record<string, unknown>, { nodes, edges }: { nodes: any[]; edges: any[] }) =>
      validateLocalPipelineGraph(nodes, edges),
    []
  );

  const workspaceContract = useMemo<PipelineWorkspaceContract>(
    () => ({
      source: "local",
      projectId,
      storage: storageAdapter,
      paletteItems: localPaletteItems,
      structCatalogue: localStructCatalogue,
      isLoadingPalette: isLoadingNodeContracts,
      capabilities: {
        canEditGraph: true,
        canSaveDraft: true,
        canSaveSnapshot: true,
        canRun: true,
      },
      validateGraph: handleValidateLocalGraph,
      cancelExecution: handleCancelLocalExecution,
    }),
    [
      projectId,
      storageAdapter,
      localPaletteItems,
      localStructCatalogue,
      isLoadingNodeContracts,
      handleValidateLocalGraph,
      handleCancelLocalExecution,
    ]
  );

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
    <PipelineWorkspaceProvider workspace={workspaceContract}>
      <div className="flex h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background">
        {/* Docked Left Sidebar */}
        <LocalWorkspaceOutliner
          projectId={projectId}
          activeDraftPipeline={activeDraftPipeline}
          activeTabId={activeTab?.id}
          collapsed={uiPrefs.sidebarCollapsed}
          onToggleCollapse={() => toggleSidebar(projectId)}
          onSelectScript={(node) => {
            handleSelectScript(node);
          }}
          onSelectDraft={(draft) => {
            handleSelectDraft(draft);
            openPipelineTab(projectId, draft);
          }}
          onOpenPalette={() => openSingletonTab(projectId, "palette")}
          onSyncPalette={handleSyncScripts}
          onOpenConfig={() => useDialogStore.getState().openDialog("workspace-config", { projectId })}
          onOpenConstants={() => openSingletonTab(projectId, "constants")}
          isCreatingPipelineExternal={isCreatingPipeline}
          onCreatingPipelineChange={setIsCreatingPipeline}
          onOpenPullDialog={() => useDialogStore.getState().openDialog("workspace-pull-studio", { projectId })}
        />

        {/* Right Column: Tab Bar + Main Workbench Area */}
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          <WorkspaceTabBar
            tabs={workbenchState.tabs}
            activeTabId={workbenchState.activeTabId}
            onSelectTab={(tabId) => setActiveTab(projectId, tabId)}
            onCloseTab={(tabId) => closeTab(projectId, tabId)}
          />

          {/* Center Content / Workbench Canvas Area */}
          <div className="flex-1 min-h-0 relative bg-background/50 overflow-hidden">
            {activeTab?.kind === "constants" ? (
              <LocalConstantsManagerPage
                projectId={projectId}
                rootPath={rootPath}
              />
            ) : activeTab?.kind === "palette" ? (
              <LocalNodePaletteWorkbench
                projectId={projectId}
                rootPath={rootPath}
                scriptsDir={config?.scriptsDir}
                customIgnores={config?.ignorePatterns}
                scanRequest={paletteScanRequest}
                initialScriptKey={paletteInitialScriptKey}
              />
            ) : activeDraftPipeline ? (
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
              ) : isLoadingGraph || (loadedGraph && loadedGraph.id !== activeDraftPipeline.fullPath) ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
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
                    onOpenPublishModal={handleOpenPublishModal}
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
                      if (mode === "visual" || mode === "yaml") {
                        setViewMode(mode);
                      }
                    }}
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
              />
            )}
          </div>
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
      <PublishCloudPipelineDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        pipelineName={loadedGraph?.name || activeDraftPipeline?.fileName || "Untitled Pipeline"}
        dagBundleJson={
          publishPayload?.dagBundleJson || {
            rootPipeline: loadedGraph || {},
          }
        }
        contractsJson={
          publishPayload?.contractsJson || {
            nodes: localPaletteItems || [],
          }
        }
        scripts={publishPayload?.scripts || []}
        projectId={projectId}
      />
    </PipelineWorkspaceProvider>
  );
}
