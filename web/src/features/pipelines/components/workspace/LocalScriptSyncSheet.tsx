import { useState, useMemo, useEffect } from "react";
import {
  HardDrive,
  Sparkles,
  Check,
  FileCode,
  RefreshCw,
  Search,
  Code2,
  Sliders,
  Loader2,
} from "lucide-react";
import { Sheet, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLocalWorkspaceStore } from "../../stores/useLocalWorkspaceStore";
import { VisualPinMapperTab } from "../script-ingestion/deck-workspace/VisualPinMapperTab";
import { ScriptCodeViewerTab } from "../script-ingestion/deck-workspace/ScriptCodeViewerTab";
import type { StagedScriptItem } from "../../types/workspaceConfig";
import type { AnalyzedCustomNodeDto } from "@/gen/model";

interface LocalScriptSyncSheetProps {
  isOpen: boolean;
  onClose: () => void;
  initialScriptKey?: string;
}

export function LocalScriptSyncSheet({
  isOpen,
  onClose,
  initialScriptKey,
}: LocalScriptSyncSheetProps) {
  const {
    scanLocalScriptsNative,
    applyStagedNodesToPalette,
  } = useLocalWorkspaceStore();

  const [stagedNodes, setStagedNodes] = useState<StagedScriptItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(initialScriptKey || null);
  const [activeTab, setActiveTab] = useState<"pins" | "code">("pins");

  const loadNativeScripts = async () => {
    setIsAnalyzing(true);
    try {
      const items = await scanLocalScriptsNative();
      setStagedNodes(items);
      if (initialScriptKey && items.some((i) => i.key === initialScriptKey)) {
        setSelectedKey(initialScriptKey);
      } else if (items.length > 0 && (!selectedKey || !items.some((i) => i.key === selectedKey))) {
        setSelectedKey(items[0].key);
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
    if (isOpen) {
      loadNativeScripts();
    }
  }, [isOpen]);

  // Set active node default from staged deck
  const activeNode: StagedScriptItem | undefined = useMemo(() => {
    if (selectedKey) {
      const found = stagedNodes.find((n) => n.key === selectedKey);
      if (found) return found;
    }
    return stagedNodes[0];
  }, [selectedKey, stagedNodes]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return stagedNodes;
    const q = searchQuery.toLowerCase();
    return stagedNodes.filter(
      (n) =>
        n.fileName.toLowerCase().includes(q) ||
        n.suggestedLabel.toLowerCase().includes(q) ||
        n.namespace.toLowerCase().includes(q)
    );
  }, [stagedNodes, searchQuery]);

  const summaryCounts = useMemo(() => {
    let newCount = 0;
    let modified = 0;
    let unchanged = 0;
    for (const n of stagedNodes) {
      if (n.status === "new") newCount++;
      else if (n.status === "modified") modified++;
      else unchanged++;
    }
    return { newCount, modified, unchanged, total: stagedNodes.length };
  }, [stagedNodes]);

  // Convert StagedScriptItem to AnalyzedCustomNodeDto for VisualPinMapperTab compatibility
  const analyzedNodeDto: AnalyzedCustomNodeDto | null = useMemo(() => {
    if (!activeNode) return null;
    return {
      fileName: activeNode.fileName,
      key: activeNode.key,
      suggestedName: activeNode.suggestedName,
      suggestedLabel: activeNode.suggestedLabel,
      executor: activeNode.executor,
      description: activeNode.description ?? null,
      contentHash: activeNode.contentHash,
      isOverride: false,
      existingNodeId: null,
      inputs: (activeNode.inputs || []) as any,
      outputs: (activeNode.outputs || []) as any,
      inputPinDiffs: [],
      outputPinDiffs: [],
      impactReport: {
        affectedPipelineCount: 0,
        affectedNodeCount: 0,
        affectedEdgeCount: 0,
        affectedPipelineNames: [],
      },
      dependencies: (activeNode.dependencies as any) || [],
    };
  }, [activeNode]);

  const handleUpdateActiveNode = (updates: Partial<AnalyzedCustomNodeDto>) => {
    if (!activeNode) return;
    setStagedNodes((prev) =>
      prev.map((node) => {
        if (node.key !== activeNode.key) return node;
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

  const handleApplyPalette = async () => {
    try {
      await applyStagedNodesToPalette(stagedNodes);
      toast.success(`${stagedNodes.length} local tools applied to palette!`, {
        description: "Available in Local Workspace Canvas with zero database footprint.",
      });
      onClose();
    } catch (err: any) {
      toast.error("Failed to apply tools to palette", {
        description: err?.message,
      });
    }
  };

  const getExecutorColor = (executor: string) => {
    const ex = executor.toLowerCase();
    if (ex.includes("blender")) return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    if (ex.includes("unreal")) return "bg-sky-500/10 text-sky-500 border-sky-500/20";
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  };

  return (
    <Sheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      side="right"
      className="sm:max-w-4xl md:max-w-5xl lg:max-w-[78vw] w-full flex flex-col h-full overflow-hidden p-0"
    >
      {/* Top Sheet Header */}
      <SheetHeader className="px-6 py-4 border-b border-border/60 shrink-0 bg-card/60">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shrink-0">
              <HardDrive className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold truncate flex items-center gap-2">
                Review Local Scripts & AST Pins
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                  Native 1-Process
                </Badge>
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground truncate">
                Verify inferred input/output pins, labels, and dependencies before applying to your palette.
              </SheetDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onPress={loadNativeScripts}
              isDisabled={isAnalyzing}
              className="gap-1.5 text-xs h-8"
            >
              <RefreshCw className={`h-3 w-3 ${isAnalyzing ? "animate-spin text-emerald-500" : ""}`} />
              Rescan Disk
            </Button>

            <Button
              size="sm"
              onPress={handleApplyPalette}
              isDisabled={isAnalyzing || stagedNodes.length === 0}
              className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <Check className="h-3.5 w-3.5" />
              Apply to Local Palette
            </Button>
          </div>
        </div>
      </SheetHeader>

      {/* Main 2-Column Split Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Script Selection Column (~300px) */}
        <div className="w-80 shrink-0 border-r border-border/60 bg-muted/20 flex flex-col h-full">
          {/* Search bar */}
          <div className="p-3 border-b border-border/60">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search scripts..."
                className="pl-8 h-8 text-xs bg-background/60"
              />
            </div>
          </div>

          {/* List of Scanned Scripts */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isAnalyzing ? (
              <div className="flex flex-col items-center justify-center p-8 text-xs text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
                <span>Running native batch analyzer...</span>
              </div>
            ) : filteredNodes.length === 0 ? (
              <div className="text-center p-6 text-xs text-muted-foreground italic">
                No scripts found in watched folders.
              </div>
            ) : (
              filteredNodes.map((node) => {
                const isSelected = activeNode?.key === node.key;
                return (
                  <div
                    key={node.key}
                    onClick={() => setSelectedKey(node.key)}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-xs transition-all ${
                      isSelected
                        ? "bg-emerald-500/10 border border-emerald-500/30 text-foreground font-medium shadow-xs"
                        : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                      <FileCode className={`h-4 w-4 shrink-0 ${isSelected ? "text-emerald-500" : "text-muted-foreground"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground text-xs font-medium">
                          {node.suggestedLabel || node.fileName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {node.inputs?.length || 0} in • {node.outputs?.length || 0} out
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {node.status === "new" && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-emerald-500/15 text-emerald-500 border-emerald-500/30 font-medium">
                          New
                        </Badge>
                      )}
                      {node.status === "modified" && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-amber-500/15 text-amber-500 border-amber-500/30 font-medium">
                          Mod
                        </Badge>
                      )}
                      {node.status === "unchanged" && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-muted/60 text-muted-foreground border-border/40">
                          Same
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${getExecutorColor(node.executor)}`}>
                        {node.executor}
                      </Badge>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Left Footer Summary */}
          <div className="p-2.5 border-t border-border/60 text-[11px] text-muted-foreground bg-card/40 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-emerald-500 font-medium">+{summaryCounts.newCount} new</span>
              {summaryCounts.modified > 0 && (
                <span className="text-amber-500 font-medium">{summaryCounts.modified} mod</span>
              )}
              <span>{summaryCounts.unchanged} same</span>
            </div>
            <span className="font-semibold text-foreground">{summaryCounts.total} total</span>
          </div>
        </div>

        {/* Right Detail Column: Tabs for Pin Mapper and Code Viewer */}
        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-background">
          {activeNode && analyzedNodeDto ? (
            <div className="flex flex-col h-full min-h-0">
              {/* Tab Selector Header */}
              <div className="flex items-center justify-between px-6 py-2.5 border-b border-border/60 bg-card/20 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {activeNode.suggestedLabel || activeNode.fileName}
                  </span>
                  <Badge variant="outline" className={`text-[10px] ${getExecutorColor(activeNode.executor)}`}>
                    {activeNode.executor}
                  </Badge>
                </div>

                <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/60">
                  <button
                    onClick={() => setActiveTab("pins")}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      activeTab === "pins"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    <span>Pin Mapper</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("code")}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      activeTab === "code"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span>Source Code</span>
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {activeTab === "pins" ? (
                  <div className="p-4">
                    <VisualPinMapperTab
                      node={analyzedNodeDto}
                      onUpdateNode={handleUpdateActiveNode}
                    />
                  </div>
                ) : (
                  <ScriptCodeViewerTab
                    fileName={activeNode.fileName}
                    sourceCode={activeNode.sourceCode || "# Source code not loaded directly"}
                    executor={activeNode.executor}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <Sparkles className="h-10 w-10 text-muted-foreground opacity-50 mb-3" />
              <p className="text-sm font-medium text-foreground">No Script Selected</p>
              <p className="text-xs text-muted-foreground mt-1">
                Select a script from the list on the left to review its pins and code.
              </p>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}


