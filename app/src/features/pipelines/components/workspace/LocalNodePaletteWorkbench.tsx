import { useState, useMemo, useEffect } from "react";
import {
  FileCode,
  Check,
  RefreshCw,
  Trash2,
  HardDrive,
  Loader2,
  Save,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocalPaletteQuery } from "../../hooks/workspace";
import {
  useWorkspaceUiPrefsStore,
  useProjectUiPrefs,
} from "../../stores/useWorkspaceUiPrefsStore";
import { DeckSidebar } from "../script-ingestion/deck-sidebar/DeckSidebar";
import {
  WorkspaceHeader,
  type IngestionActiveTab,
} from "../script-ingestion/deck-workspace/WorkspaceHeader";
import { VisualPinMapperTab } from "../script-ingestion/deck-workspace/VisualPinMapperTab";
import { ScriptCodeViewerTab } from "../script-ingestion/deck-workspace/ScriptCodeViewerTab";
import { ImpactReconciliationTab } from "../script-ingestion/deck-workspace/ImpactReconciliationTab";
import type {
  StagedScriptItem,
  LocalDraftNode,
  LocalStructDefinition,
} from "../../types/workspaceConfig";
import type { AnalyzedCustomNodeDto } from "@/gen/model";

interface LocalNodePaletteWorkbenchProps {
  projectId: string;
  rootPath?: string | null;
  scriptsDir?: string;
  customIgnores?: string[];
  scanRequest?: number;
  initialScriptKey?: string;
}

export function LocalNodePaletteWorkbench({
  projectId,
  rootPath = null,
  scriptsDir,
  customIgnores,
  scanRequest = 0,
  initialScriptKey,
}: LocalNodePaletteWorkbenchProps) {
  const {
    draftNodes,
    previewScanScripts,
    applyPalette,
    clearPalette,
    removeNodeFromPalette,
    saveScriptOverride,
  } = useLocalPaletteQuery(rootPath, scriptsDir, customIgnores);

  const uiPrefs = useProjectUiPrefs(projectId);
  const setPaletteDeckPrefs = useWorkspaceUiPrefsStore((s) => s.setPaletteDeckPrefs);

  const [mode, setMode] = useState<"library" | "review">("library");
  const [stagedNodes, setStagedNodes] = useState<StagedScriptItem[]>([]);
  const [stagedStructs, setStagedStructs] = useState<LocalStructDefinition[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [libraryEdits, setLibraryEdits] = useState<Record<string, LocalDraftNode>>({});
  const [isSavingOverride, setIsSavingOverride] = useState(false);

  const activeTab: IngestionActiveTab = uiPrefs.paletteDeck.activeTab || "pins";
  const setActiveTab = (tab: IngestionActiveTab) => {
    setPaletteDeckPrefs(projectId, { activeTab: tab });
  };

  // Build library items directly from workspace.db (draftNodes) without scanning disk
  const libraryItems: StagedScriptItem[] = useMemo(() => {
    return Object.values(draftNodes)
      .sort((a, b) => (a.suggestedLabel || a.fileName).localeCompare(b.suggestedLabel || b.fileName))
      .map((rawNode) => {
        const node = libraryEdits[rawNode.key] || rawNode;
        return {
          key: node.key,
          fileName: node.fileName,
          fullPath: node.fullPath,
          folderRoot: node.folderRoot || "",
          executor: node.executor,
          suggestedName: node.suggestedName,
          suggestedLabel: node.suggestedLabel,
          description: node.description,
          contentHash: node.contentHash,
          inputs: node.inputs || [],
          outputs: node.outputs || [],
          dependencies: node.dependencies || [],
          sourceCode: node.sourceCode || "",
          status: "unchanged",
          lastSyncedAt: node.lastSyncedAt || "",
        };
      });
  }, [draftNodes, libraryEdits]);

  const runDiskScan = async () => {
    setIsAnalyzing(true);
    setMode("review");
    try {
      const result = await previewScanScripts();
      if (result) {
        setStagedStructs(result.localStructs || []);
        const scannedList = Object.values(result.draftNodes || {});
        const items: StagedScriptItem[] = scannedList.map((node: LocalDraftNode) => {
          const existing = draftNodes[node.key];
          let status: "new" | "modified" | "unchanged" = "new";
          if (existing) {
            status = existing.contentHash === node.contentHash ? "unchanged" : "modified";
          }
          return {
            key: node.key,
            fileName: node.fileName,
            fullPath: node.fullPath,
            folderRoot: node.folderRoot || "",
            executor: node.executor,
            suggestedName: node.suggestedName,
            suggestedLabel: node.suggestedLabel,
            description: node.description,
            contentHash: node.contentHash,
            inputs: node.inputs || [],
            outputs: node.outputs || [],
            dependencies: node.dependencies || [],
            sourceCode: node.sourceCode || "",
            status,
            lastSyncedAt: node.lastSyncedAt || "",
          };
        });
        setStagedNodes(items);
        if (initialScriptKey) {
          const foundIdx = items.findIndex((i) => i.key === initialScriptKey);
          if (foundIdx >= 0) setSelectedIndex(foundIdx);
        } else {
          setSelectedIndex(0);
        }
        toast.success(
          `Discovered ${result.scanSummary?.total || items.length} scripts ready for review!`,
        );
      }
    } catch (err: any) {
      toast.error("Failed to analyze local scripts", {
        description: err?.message || "Error running native script analyzer",
      });
      setMode("library");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Only scan when user explicitly triggers Sync (scanRequest increments > 0)
  useEffect(() => {
    if (scanRequest > 0) {
      runDiskScan();
    }
  }, [scanRequest]);

  // Select initial script in library mode if provided
  useEffect(() => {
    if (mode === "library" && initialScriptKey && libraryItems.length > 0) {
      const idx = libraryItems.findIndex((i) => i.key === initialScriptKey);
      if (idx >= 0) setSelectedIndex(idx);
    }
  }, [initialScriptKey, mode, libraryItems.length]);

  const activeItems = mode === "review" ? stagedNodes : libraryItems;

  const analyzedNodes: AnalyzedCustomNodeDto[] = useMemo(() => {
    return activeItems.map((item) => ({
      key: item.key,
      fileName: item.fileName,
      suggestedName: item.suggestedName,
      suggestedLabel: item.suggestedLabel,
      executor: item.executor,
      description: item.description ?? null,
      contentHash: item.contentHash,
      isOverride: mode === "review" ? item.status === "modified" : false,
      existingNodeId: null,
      hasBreakingChanges: false,
      impactReport: {
        affectedPipelineCount: 0,
        affectedNodeCount: 0,
        affectedEdgeCount: 0,
        affectedPipelineNames: [],
      },
      inputPinDiffs: [],
      outputPinDiffs: [],
      inputs: item.inputs.map((p) => ({
        id: p.id,
        label: p.label,
        primitiveType: p.primitiveType as any,
        structType: p.structType ?? null,
        isRequired: Boolean(p.isRequired),
        defaultValue: p.defaultValue ?? null,
        description: p.description ?? null,
        metadata: p.metadata ?? null,
      })),
      outputs: item.outputs.map((p) => ({
        id: p.id,
        label: p.label,
        primitiveType: p.primitiveType as any,
        structType: p.structType ?? null,
        isRequired: Boolean(p.isRequired),
        defaultValue: p.defaultValue ?? null,
        description: p.description ?? null,
        metadata: p.metadata ?? null,
      })),
      dependencies: item.dependencies,
    }));
  }, [activeItems, mode]);

  const safeSelectedIndex = Math.min(
    selectedIndex,
    Math.max(0, analyzedNodes.length - 1),
  );
  const selectedNode = analyzedNodes[safeSelectedIndex];
  const isSelectedDirty = Boolean(selectedNode && libraryEdits[selectedNode.key]);

  const handleUpdateSelectedNode = (updates: Partial<AnalyzedCustomNodeDto>) => {
    if (!selectedNode) return;
    const updatedDto = { ...selectedNode, ...updates };
    if (mode === "review") {
      setStagedNodes((prev) =>
        prev.map((item, idx) =>
          idx === safeSelectedIndex
            ? {
                ...item,
                suggestedName: updatedDto.suggestedName,
                suggestedLabel: updatedDto.suggestedLabel,
                executor: updatedDto.executor,
                description: updatedDto.description ?? undefined,
                inputs: (updatedDto.inputs || []).map((p) => ({
                  id: p.id,
                  label: p.label,
                  primitiveType: p.primitiveType as any,
                  structType: p.structType ?? undefined,
                  isRequired: Boolean(p.isRequired),
                  defaultValue: p.defaultValue,
                  description: p.description ?? undefined,
                  metadata: p.metadata ?? undefined,
                })),
                outputs: (updatedDto.outputs || []).map((p) => ({
                  id: p.id,
                  label: p.label,
                  primitiveType: p.primitiveType as any,
                  structType: p.structType ?? undefined,
                  isRequired: Boolean(p.isRequired),
                  defaultValue: p.defaultValue,
                  description: p.description ?? undefined,
                  metadata: p.metadata ?? undefined,
                })),
              }
            : item,
        ),
      );
      return;
    }

    const base = draftNodes[selectedNode.key];
    if (!base) return;
    setLibraryEdits((prev) => ({
      ...prev,
      [selectedNode.key]: {
        ...base,
        suggestedName: updatedDto.suggestedName,
        suggestedLabel: updatedDto.suggestedLabel,
        executor: updatedDto.executor,
        description: updatedDto.description ?? undefined,
        inputs: (updatedDto.inputs || []).map((p) => ({
          id: p.id,
          label: p.label,
          primitiveType: p.primitiveType as any,
          structType: p.structType ?? undefined,
          isRequired: Boolean(p.isRequired),
          defaultValue: p.defaultValue,
          description: p.description ?? undefined,
          metadata: p.metadata ?? undefined,
        })),
        outputs: (updatedDto.outputs || []).map((p) => ({
          id: p.id,
          label: p.label,
          primitiveType: p.primitiveType as any,
          structType: p.structType ?? undefined,
          isRequired: Boolean(p.isRequired),
          defaultValue: p.defaultValue,
          description: p.description ?? undefined,
          metadata: p.metadata ?? undefined,
        })),
      },
    }));
  };

  const handleSaveSelectedOverride = async () => {
    if (!selectedNode) return;
    const edited = libraryEdits[selectedNode.key];
    if (!edited) return;
    setIsSavingOverride(true);
    try {
      const inputsMap: Record<string, any> = {};
      for (const p of edited.inputs || []) {
        inputsMap[p.id] = {
          label: p.label,
          primitiveType: p.primitiveType,
          structType: p.structType ?? null,
          defaultValue: p.defaultValue ?? null,
          description: p.description ?? null,
          metadata: p.metadata ?? null,
        };
      }
      const outputsMap: Record<string, any> = {};
      for (const p of edited.outputs || []) {
        outputsMap[p.id] = {
          label: p.label,
          primitiveType: p.primitiveType,
          structType: p.structType ?? null,
          defaultValue: p.defaultValue ?? null,
          description: p.description ?? null,
          metadata: p.metadata ?? null,
        };
      }
      await saveScriptOverride({
        scriptKey: edited.key,
        overrideCfg: {
          label: edited.suggestedLabel,
          description: edited.description ?? null,
          executor: edited.executor,
          inputs: inputsMap,
          outputs: outputsMap,
        },
      });
      setLibraryEdits((prev) => {
        const next = { ...prev };
        delete next[edited.key];
        return next;
      });
      toast.success(`Saved overrides for ${edited.suggestedLabel} to contracts.yaml`);
    } catch (err: any) {
      toast.error("Failed to save script override", {
        description: err?.message,
      });
    } finally {
      setIsSavingOverride(false);
    }
  };

  const handleDiscardSelectedEdit = () => {
    if (!selectedNode) return;
    setLibraryEdits((prev) => {
      const next = { ...prev };
      delete next[selectedNode.key];
      return next;
    });
  };

  const handleRemoveSlide = async (key: string) => {
    if (mode === "review") {
      setStagedNodes((prev) => prev.filter((item) => item.key !== key));
      return;
    }
    try {
      await removeNodeFromPalette(key);
      toast.success("Removed node from Local Palette");
    } catch (err: any) {
      toast.error("Failed to remove node", { description: err?.message });
    }
  };

  const handleApplyPalette = async () => {
    const nodesMap: Record<string, LocalDraftNode> = {};
    for (const item of stagedNodes) {
      nodesMap[item.key] = {
        key: item.key,
        fileName: item.fileName,
        fullPath: item.fullPath,
        folderRoot: item.folderRoot,
        executor: item.executor,
        suggestedName: item.suggestedName,
        suggestedLabel: item.suggestedLabel,
        description: item.description,
        contentHash: item.contentHash,
        inputs: item.inputs,
        outputs: item.outputs,
        dependencies: item.dependencies,
        sourceCode: item.sourceCode,
        lastSyncedAt: new Date().toISOString(),
      };
    }

    try {
      await applyPalette({ nodes: nodesMap, structs: stagedStructs });
      toast.success(`Synced ${stagedNodes.length} nodes to Local Palette!`);
      setMode("library");
      setStagedNodes([]);
    } catch (err: any) {
      toast.error("Failed to save local palette", {
        description: err?.message,
      });
    }
  };

  const handlePurgePalette = async () => {
    try {
      await clearPalette();
      setStagedNodes([]);
      setLibraryEdits({});
      toast.info("Cleared Local Palette cache.");
    } catch (err: any) {
      toast.error("Failed to clear palette", { description: err?.message });
    }
  };

  const stats = useMemo(() => {
    let newCount = 0;
    let modCount = 0;
    let sameCount = 0;
    for (const item of stagedNodes) {
      if (item.status === "new") newCount++;
      else if (item.status === "modified") modCount++;
      else sameCount++;
    }
    return { newCount, modCount, sameCount, total: stagedNodes.length };
  }, [stagedNodes]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Top Header */}
      <div className="h-14 border-b border-border bg-card/60 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
            <FileCode className="size-4" />
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-bold tracking-tight text-foreground">
              Node Palette
            </h1>
            {mode === "library" ? (
              <Badge variant="outline" className="text-[11px] font-mono">
                Palette · {libraryItems.length} nodes
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="text-[11px] font-mono border-amber-500/40 text-amber-400 bg-amber-500/10"
              >
                Reviewing Scan · +{stats.newCount} new · {stats.modCount} modified
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mode === "library" && isSelectedDirty && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onPress={handleDiscardSelectedEdit}
                className="gap-1.5 text-xs h-8 text-muted-foreground"
              >
                <RotateCcw className="size-3.5" />
                Discard
              </Button>
              <Button
                size="sm"
                onPress={handleSaveSelectedOverride}
                isDisabled={isSavingOverride}
                className="gap-1.5 text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
              >
                <Save className="size-3.5" />
                {isSavingOverride ? "Saving..." : "Save Overrides"}
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onPress={runDiskScan}
            isDisabled={isAnalyzing}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className={`size-3.5 ${isAnalyzing ? "animate-spin text-emerald-500" : ""}`} />
            Rescan Disk
          </Button>

          <Button
            variant="outline"
            size="sm"
            onPress={handlePurgePalette}
            className="gap-1.5 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
          >
            <Trash2 className="size-3.5" />
            Purge Palette
          </Button>

          {mode === "review" && (
            <Button
              size="sm"
              onPress={handleApplyPalette}
              isDisabled={isAnalyzing || stagedNodes.length === 0}
              className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              <Check className="size-3.5" />
              Apply {stagedNodes.length} Nodes
            </Button>
          )}
        </div>
      </div>

      {/* Main Studio Body */}
      {isAnalyzing ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <Loader2 className="size-10 text-emerald-500 animate-spin mb-4" />
          <h3 className="text-base font-semibold text-foreground">
            Scanning Local Disk Scripts...
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1">
            Running native Rust AST inspection on your workspace folder.
          </p>
        </div>
      ) : analyzedNodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <HardDrive className="size-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-base font-semibold text-foreground">
            {mode === "review" ? "No Python Scripts Discovered" : "Local Node Palette is Empty"}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1">
            {mode === "review"
              ? `No valid .py scripts with Forgity signatures found in ${scriptsDir || "scripts"}.`
              : "Click Rescan Disk above or Sync on the sidebar to scan and import scripts."}
          </p>
          <Button variant="outline" size="sm" onPress={runDiskScan} className="mt-4 gap-1.5">
            <RefreshCw className="size-3.5" />
            Scan Scripts Now
          </Button>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <DeckSidebar
            nodes={analyzedNodes}
            selectedIndex={safeSelectedIndex}
            onSelectIndex={setSelectedIndex}
            onRemoveNode={handleRemoveSlide}
            showStatusFilters={mode === "review"}
          />

          {selectedNode ? (
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
              <WorkspaceHeader
                node={selectedNode}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />

              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === "pins" && (
                  <VisualPinMapperTab
                    node={selectedNode}
                    onUpdateNode={handleUpdateSelectedNode}
                  />
                )}
                {activeTab === "code" && (
                  <ScriptCodeViewerTab
                    sourceCode={activeItems[safeSelectedIndex]?.sourceCode || ""}
                    fileName={selectedNode.fileName}
                  />
                )}
                {activeTab === "impact" && (
                  <ImpactReconciliationTab
                    node={selectedNode}
                    strategy={0}
                    onStrategyChange={() => {}}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
              Select a script slide from the deck to inspect.
            </div>
          )}
        </div>
      )}

      {/* Footer Bar */}
      <div className="h-12 border-t border-border bg-card/40 px-6 flex items-center justify-between shrink-0 text-xs">
        {mode === "review" ? (
          <>
            <div className="flex items-center gap-3 text-muted-foreground">
              <span>
                Total: <strong className="text-foreground">{analyzedNodes.length}</strong> scripts
              </span>
              <span>•</span>
              <span className="text-emerald-500 font-medium">+{stats.newCount} new</span>
              {stats.modCount > 0 && (
                <>
                  <span>•</span>
                  <span className="text-amber-500 font-medium">{stats.modCount} modified</span>
                </>
              )}
              <span>•</span>
              <span className="text-muted-foreground">{stats.sameCount} unchanged</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  setMode("library");
                  setStagedNodes([]);
                }}
                className="h-7 text-xs"
              >
                Discard Scan
              </Button>
              <Button
                size="sm"
                onPress={handleApplyPalette}
                isDisabled={isAnalyzing || stagedNodes.length === 0}
                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
              >
                <Check className="size-3.5" />
                Apply to Local Palette
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-muted-foreground">
            <span>
              Loaded <strong className="text-foreground">{libraryItems.length}</strong> nodes from{" "}
              <code className="text-[11px]">workspace.db</code>
            </span>
            {isSelectedDirty && (
              <>
                <span>•</span>
                <span className="text-indigo-400 font-medium">
                  Unsaved pin overrides on {selectedNode?.suggestedLabel}
                </span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

