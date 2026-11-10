import { useState, useMemo } from "react";
import {
  HardDrive,
  Sparkles,
  Check,
  FileCode,
  RefreshCw,
  Search,
  Code2,
  Sliders,
} from "lucide-react";
import { Sheet, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLocalWorkspaceStore } from "../../stores/useLocalWorkspaceStore";
import { VisualPinMapperTab } from "../script-ingestion/deck-workspace/VisualPinMapperTab";
import { ScriptCodeViewerTab } from "../script-ingestion/deck-workspace/ScriptCodeViewerTab";
import type { LocalDraftNode } from "../../types/workspaceConfig";
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
    draftNodes,
    scanSummary,
    isScanning,
    scanAndSyncScripts,
    updateDraftNode,
  } = useLocalWorkspaceStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(initialScriptKey || null);
  const [activeTab, setActiveTab] = useState<"pins" | "code">("pins");

  const nodeList = useMemo(() => Object.values(draftNodes), [draftNodes]);

  // Set active node default
  const activeNode: LocalDraftNode | undefined = useMemo(() => {
    if (selectedKey && draftNodes[selectedKey]) {
      return draftNodes[selectedKey];
    }
    return nodeList[0];
  }, [selectedKey, draftNodes, nodeList]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return nodeList;
    const q = searchQuery.toLowerCase();
    return nodeList.filter(
      (n) =>
        n.fileName.toLowerCase().includes(q) ||
        n.suggestedLabel.toLowerCase().includes(q) ||
        n.namespace.toLowerCase().includes(q)
    );
  }, [nodeList, searchQuery]);

  // Convert LocalDraftNode to AnalyzedCustomNodeDto for VisualPinMapperTab compatibility
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
    updateDraftNode(activeNode.key, {
      suggestedLabel: updates.suggestedLabel ?? activeNode.suggestedLabel,
      suggestedName: updates.suggestedName ?? activeNode.suggestedName,
      description: updates.description ?? activeNode.description,
      executor: updates.executor ?? activeNode.executor,
      inputs: updates.inputs ? (updates.inputs as any[]) : activeNode.inputs,
      outputs: updates.outputs ? (updates.outputs as any[]) : activeNode.outputs,
    });
  };

  const handleApplyPalette = () => {
    toast.success(`${nodeList.length} local tools verified and ready in palette!`, {
      description: "Available in Local Workspace Canvas with zero database footprint.",
    });
    onClose();
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
                  Zero-DB Memory
                </Badge>
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground truncate">
                Verify inferred input/output pins, custom labels, and security checks before applying to your workspace.
              </SheetDescription>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onPress={() => scanAndSyncScripts()}
              isDisabled={isScanning}
              className="gap-1.5 text-xs h-8"
            >
              <RefreshCw className={`h-3 w-3 ${isScanning ? "animate-spin text-emerald-500" : ""}`} />
              Rescan Disk
            </Button>

            <Button
              size="sm"
              onPress={handleApplyPalette}
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
        <div className="w-72 shrink-0 border-r border-border/60 bg-muted/20 flex flex-col h-full">
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
            {filteredNodes.length === 0 ? (
              <div className="text-center p-6 text-xs text-muted-foreground italic">
                No scripts matched filter.
              </div>
            ) : (
              filteredNodes.map((node) => {
                const isSelected = activeNode?.key === node.key;
                return (
                  <div
                    key={node.key}
                    onClick={() => setSelectedKey(node.key)}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer text-xs transition-all ${isSelected
                        ? "bg-emerald-500/10 border border-emerald-500/30 text-foreground font-medium shadow-xs"
                        : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <FileCode className={`h-4 w-4 shrink-0 ${isSelected ? "text-emerald-500" : "text-muted-foreground"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground text-xs">
                          {node.suggestedLabel || node.fileName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {node.inputs?.length || 0} in • {node.outputs?.length || 0} out
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${getExecutorColor(node.executor)}`}>
                      {node.executor}
                    </Badge>
                  </div>
                );
              })
            )}
          </div>

          {/* Left Footer Summary */}
          {scanSummary && (
            <div className="p-2.5 border-t border-border/60 text-[11px] text-muted-foreground bg-card/40 flex items-center justify-between">
              <span>Total: {nodeList.length} scripts</span>
              <span className="text-emerald-500 font-medium">Ready</span>
            </div>
          )}
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
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-all ${activeTab === "pins"
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    <span>Pin Mapper</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("code")}
                    className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-all ${activeTab === "code"
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

