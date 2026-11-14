import { useState, useMemo, useEffect } from "react";
import {
  FileCode,
  Check,
  RefreshCw,
  Trash2,
  HardDrive,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLocalPaletteQuery } from "../../hooks/workspace";
import { DeckSidebar } from "../script-ingestion/deck-sidebar/DeckSidebar";
import {
  WorkspaceHeader,
  type IngestionActiveTab,
} from "../script-ingestion/deck-workspace/WorkspaceHeader";
import { VisualPinMapperTab } from "../script-ingestion/deck-workspace/VisualPinMapperTab";
import { ScriptCodeViewerTab } from "../script-ingestion/deck-workspace/ScriptCodeViewerTab";
import { ImpactReconciliationTab } from "../script-ingestion/deck-workspace/ImpactReconciliationTab";
import type { StagedScriptItem, LocalDraftNode, LocalStructDefinition } from "../../types/workspaceConfig";
import type { AnalyzedCustomNodeDto } from "@/gen/model";

interface LocalScriptSyncSheetProps {
  rootPath?: string | null;
  scriptsDir?: string;
  customIgnores?: string[];
  isOpen: boolean;
  onClose: () => void;
  initialScriptKey?: string;
  embedded?: boolean;
}

export function LocalScriptSyncSheet({
  rootPath = null,
  scriptsDir,
  customIgnores,
  isOpen,
  onClose,
  initialScriptKey: _initialScriptKey,
  embedded = false,
}: LocalScriptSyncSheetProps) {
  const {
    previewScanScripts,
    applyPalette,
    clearPalette,
  } = useLocalPaletteQuery(rootPath, scriptsDir, customIgnores);

  const [stagedNodes, setStagedNodes] = useState<StagedScriptItem[]>([]);
  const [stagedStructs, setStagedStructs] = useState<LocalStructDefinition[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<IngestionActiveTab>("pins");

  const loadNativeScripts = async () => {
    setIsAnalyzing(true);
    try {
      const result = await previewScanScripts();
      if (result) {
        setStagedStructs(result.localStructs || []);
        const nodesMap = result.draftNodes;
        const items: StagedScriptItem[] = Object.values(nodesMap).map((node) => {
          const cached = (result.scanSummary as any)?.originalPalette?.[node.key];
          let status: "new" | "modified" | "unchanged" = "new";
          if (cached) {
            status = cached.contentHash === node.contentHash ? "unchanged" : "modified";
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
        if (_initialScriptKey) {
          const foundIdx = items.findIndex((i) => i.key === _initialScriptKey);
          if (foundIdx >= 0) setSelectedIndex(foundIdx);
        }
        toast.success(
          `Discovered ${result.scanSummary?.total || items.length} scripts ready for review!`,
        );
      }
    } catch (err: any) {
      toast.error("Failed to analyze local scripts", {
        description: err?.message || "Error running native script analyzer",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    if (embedded || isOpen) {
      loadNativeScripts();
    }
  }, [embedded, isOpen, rootPath, scriptsDir]);

  // Convert StagedScriptItem[] to AnalyzedCustomNodeDto[] for full compatibility with Deck components
  const analyzedNodes: AnalyzedCustomNodeDto[] = useMemo(() => {
    return stagedNodes.map((item) => ({
      key: item.key,
      fileName: item.fileName,
      suggestedName: item.suggestedName,
      suggestedLabel: item.suggestedLabel,
      executor: item.executor,
      description: item.description ?? null,
      contentHash: item.contentHash,
      isOverride: item.status === "modified",
      existingNodeId: null,
      inputs: (item.inputs || []) as any,
      outputs: (item.outputs || []) as any,
      inputPinDiffs: [],
      outputPinDiffs: [],
      impactReport: {
        affectedPipelineCount: 0,
        affectedNodeCount: 0,
        affectedEdgeCount: 0,
        affectedPipelineNames: [],
      },
      dependencies: (item.dependencies as any) || [],
    }));
  }, [stagedNodes]);

  const selectedNode = analyzedNodes[selectedIndex] || null;
  const activeStagedItem = stagedNodes[selectedIndex] || null;

  const handleUpdateNode = (key: string, updates: Partial<AnalyzedCustomNodeDto>) => {
    setStagedNodes((prev) =>
      prev.map((node) => {
        if (node.key !== key) return node;
        return {
          ...node,
          suggestedLabel: updates.suggestedLabel ?? node.suggestedLabel,
          suggestedName: updates.suggestedName ?? node.suggestedName,
          description: updates.description ?? node.description,
          executor: updates.executor ?? node.executor,
          inputs: updates.inputs ? (updates.inputs as any[]) : node.inputs,
          outputs: updates.outputs ? (updates.outputs as any[]) : node.outputs,
        };
      })
    );
  };

  const handleRemoveNode = (key: string) => {
    setStagedNodes((prev) => {
      const next = prev.filter((n) => n.key !== key);
      if (selectedIndex >= next.length) {
        setSelectedIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleApplyPalette = async () => {
    try {
      const updatedRecord: Record<string, LocalDraftNode> = {};
      const now = new Date().toISOString();
      for (const item of stagedNodes) {
        updatedRecord[item.key] = {
          key: item.key,
          fileName: item.fileName,
          fullPath: item.fullPath,
          folderRoot: "",
          namespace: "",
          suggestedName: item.suggestedName,
          suggestedLabel: item.suggestedLabel,
          executor: item.executor,
          description: item.description,
          contentHash: item.contentHash,
          sourceCode: item.sourceCode || "",
          inputs: item.inputs || [],
          outputs: item.outputs || [],
          detectedStructs: [],
          dependencies: item.dependencies || [],
          lastSyncedAt: now,
        };
      }
      await applyPalette({
        nodes: updatedRecord,
        structs: stagedStructs,
      });
      toast.success(`Applied ${stagedNodes.length} tools to Local Palette!`);
      onClose();
    } catch (err: any) {
      toast.error("Failed to save palette", { description: err?.message });
    }
  };

  const handlePurgePalette = async () => {
    try {
      await clearPalette();
      setStagedNodes([]);
      setSelectedIndex(0);
      toast.success(
        "Palette purged! Click 'Rescan Disk' to load fresh scripts.",
      );
    } catch (err: any) {
      toast.error("Failed to purge palette", { description: err?.message });
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

  const content = (
    <>
      {/* Top Header */}
      <div className="h-14 border-b border-border bg-card/60 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {embedded && (
            <Button
              variant="ghost"
              size="sm"
              onPress={onClose}
              className="gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground -ml-2"
            >
              <ArrowLeft className="size-3.5" />
              Back to Canvas
            </Button>
          )}
          <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
            <FileCode className="size-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-foreground">
              {embedded ? "Node Palette & Script Ingestion" : "Local Script Ingestion & Review Studio"}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={loadNativeScripts}
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

          <Button
            size="sm"
            onPress={handleApplyPalette}
            isDisabled={isAnalyzing || stagedNodes.length === 0}
            className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
          >
            <Check className="size-3.5" />
            Apply {stagedNodes.length} Nodes to Palette
          </Button>
        </div>
      </div>

      {/* Main 2-Column Deck Workspace */}
      {isAnalyzing ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 className="size-8 animate-spin text-emerald-500" />
          <span className="text-sm text-muted-foreground">Running native 1-shot batch script analyzer...</span>
        </div>
      ) : analyzedNodes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
          <HardDrive className="size-12 text-muted-foreground opacity-40" />
          <p className="text-sm font-semibold text-foreground">No scripts found in watched folders</p>
          <p className="text-xs text-muted-foreground max-w-md">
            Configure watched script folders in Outliner, or verify your python paths.
          </p>
        </div>
      ) : (
        <div className="flex-1 flex min-w-0 overflow-hidden">
          {/* Left Deck Sidebar (Ingestion Studio component) */}
          <DeckSidebar
            nodes={analyzedNodes}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onRemoveNode={handleRemoveNode}
            onAddMoreFiles={() => {}}
          />

          {/* Right Deck Workspace */}
          {selectedNode ? (
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
              {/* Workspace Header (Ingestion Studio component) */}
              <WorkspaceHeader
                node={selectedNode}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />

              {/* Tab Content */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {activeTab === "pins" && (
                  <div className="p-6">
                    <VisualPinMapperTab
                      node={selectedNode}
                      onUpdateNode={(updates) => handleUpdateNode(selectedNode.key, updates)}
                    />
                  </div>
                )}
                {activeTab === "code" && (
                  <ScriptCodeViewerTab
                    fileName={selectedNode.fileName}
                    sourceCode={activeStagedItem?.sourceCode || "# Source code not loaded"}
                    executor={selectedNode.executor}
                  />
                )}
                {activeTab === "impact" && (
                  <div className="p-6">
                    <ImpactReconciliationTab
                      node={selectedNode}
                      strategy={0}
                      onStrategyChange={() => {}}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs">
              Select a script slide from the deck to inspect.
            </div>
          )}
        </div>
      )}

      {/* Footer Bar */}
      <div className="h-12 border-t border-border bg-card/40 px-6 flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span>Total: <strong className="text-foreground">{analyzedNodes.length}</strong> scripts</span>
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
          <Button variant="ghost" size="sm" onPress={onClose} className="h-7 text-xs">
            {embedded ? "Back to Canvas" : "Cancel"}
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
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
        {content}
      </div>
    );
  }

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="sm:max-w-[95vw] max-w-[95vw] w-[95vw] h-[90vh] max-h-[90vh] p-0 gap-0 overflow-hidden rounded-2xl bg-background border border-border shadow-2xl flex flex-col"
    >
      {content}
    </Dialog>
  );
}


