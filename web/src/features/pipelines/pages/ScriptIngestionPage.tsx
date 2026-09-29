import { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useAnalyzeCustomNodesBatchMutation,
  useBatchUpsertCustomNodesMutation,
} from "../hooks/usePipelines";
import { IngestionDropzone } from "../components/script-ingestion/IngestionDropzone";
import { DeckSidebar } from "../components/script-ingestion/deck-sidebar/DeckSidebar";
import {
  WorkspaceHeader,
  type IngestionActiveTab,
} from "../components/script-ingestion/deck-workspace/WorkspaceHeader";
import { VisualPinMapperTab } from "../components/script-ingestion/deck-workspace/VisualPinMapperTab";
import { ScriptCodeViewerTab } from "../components/script-ingestion/deck-workspace/ScriptCodeViewerTab";
import { ImpactReconciliationTab } from "../components/script-ingestion/deck-workspace/ImpactReconciliationTab";
import { IngestionFooterBar } from "../components/script-ingestion/IngestionFooterBar";
import type { AnalyzedCustomNodeDto, BatchUpsertItem } from "@/gen/model";

interface ScriptIngestionPageProps {
  projectId: string;
}

export function ScriptIngestionPage({ projectId }: ScriptIngestionPageProps) {
  const navigate = useNavigate();

  const [analyzedNodes, setAnalyzedNodes] = useState<AnalyzedCustomNodeDto[]>([]);
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<IngestionActiveTab>("pins");
  const [nodeStrategies, setNodeStrategies] = useState<Record<string, number>>({});

  const analyzeMutation = useAnalyzeCustomNodesBatchMutation();
  const batchUpsertMutation = useBatchUpsertCustomNodesMutation(projectId);

  const processFiles = useCallback(
    async (files: File[]) => {
      const pythonFiles = files.filter((f) => f.name.endsWith(".py"));
      if (pythonFiles.length === 0) {
        toast.error("Please provide valid Python (.py) script files.");
        return;
      }

      try {
        const readFiles = await Promise.all(
          pythonFiles.map(async (file) => ({
            fileName: file.name,
            scriptContent: await file.text(),
          }))
        );

        // Store file contents for source code preview
        const newContents: Record<string, string> = {};
        readFiles.forEach((f) => {
          newContents[f.fileName] = f.scriptContent;
        });
        setFileContents((prev) => ({ ...prev, ...newContents }));

        const result = await analyzeMutation.mutateAsync({
          projectId,
          scripts: readFiles,
        });

        if (result?.nodes && result.nodes.length > 0) {
          setAnalyzedNodes((prev) => {
            // Merge existing and newly analyzed nodes by key
            const existingKeys = new Set(result.nodes.map((n) => n.key));
            const filteredOld = prev.filter((n) => !existingKeys.has(n.key));
            return [...filteredOld, ...result.nodes];
          });

          // Initialize default strategies (0 = KeepCompatible)
          const initialStrategies: Record<string, number> = {};
          result.nodes.forEach((n) => {
            initialStrategies[n.key] = 0;
          });
          setNodeStrategies((prev) => ({ ...prev, ...initialStrategies }));

          toast.success(`Analyzed ${result.nodes.length} script(s) successfully!`);
        }
      } catch (err: any) {
        const errorMsg =
          err?.response?.data?.message || err?.message || "Failed to analyze scripts";
        toast.error(errorMsg);
      }
    },
    [projectId, analyzeMutation]
  );

  const handleUpdateNode = (key: string, updates: Partial<AnalyzedCustomNodeDto>) => {
    setAnalyzedNodes((prev) =>
      prev.map((n) => (n.key === key ? { ...n, ...updates } : n))
    );
  };

  const handleRemoveNode = (key: string) => {
    setAnalyzedNodes((prev) => {
      const updated = prev.filter((n) => n.key !== key);
      if (selectedIndex >= updated.length) {
        setSelectedIndex(Math.max(0, updated.length - 1));
      }
      return updated;
    });
  };

  const handleReset = () => {
    setAnalyzedNodes([]);
    setFileContents({});
    setSelectedIndex(0);
    setNodeStrategies({});
  };

  const handlePublishAll = async () => {
    if (analyzedNodes.length === 0) return;

    const items: BatchUpsertItem[] = analyzedNodes.map((n) => ({
      key: n.key,
      name: n.suggestedName || n.key,
      label: n.suggestedLabel || n.suggestedName || n.fileName || null,
      executor: n.executor ?? null,
      contentHash: n.contentHash ?? null,
      originalFileName: n.fileName ?? null,
      assetId: null,
      inputs: (n.inputs ?? []) as any,
      outputs: (n.outputs ?? []) as any,
      strategy: (nodeStrategies[n.key] ?? 0) as any,
    }));

    try {
      await batchUpsertMutation.mutateAsync({
        projectId,
        items,
      });

      toast.success(`Published ${items.length} node definition(s) successfully!`);
      handleReset();
      navigate({
        to: "/projects/$projectId/pipeline/nodes",
        params: { projectId },
      });
    } catch {
      // Toast is handled by mutation hook
    }
  };

  const selectedNode = analyzedNodes[selectedIndex] || null;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] w-full overflow-hidden bg-background">
      {/* Top Navbar */}
      <div className="h-14 border-b border-border bg-card/60 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onPress={() =>
              navigate({
                to: "/projects/$projectId/pipeline/nodes",
                params: { projectId },
              })
            }
          >
            <ArrowLeft className="size-3.5" />
            Back to Node Library
          </Button>

          <span className="text-border">|</span>

          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h1 className="text-sm font-bold tracking-tight">Script Ingestion Studio</h1>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {analyzedNodes.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <IngestionDropzone
            onFilesDropped={processFiles}
            isAnalyzing={analyzeMutation.isPending}
          />
        </div>
      ) : (
        <>
          <div className="flex-1 flex min-w-0 overflow-hidden">
            {/* Left Deck Sidebar */}
            <DeckSidebar
              nodes={analyzedNodes}
              selectedIndex={selectedIndex}
              onSelectIndex={setSelectedIndex}
              onRemoveNode={handleRemoveNode}
              onAddMoreFiles={processFiles}
            />

            {/* Right Deck Workspace */}
            {selectedNode ? (
              <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
                <WorkspaceHeader
                  node={selectedNode}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />

                <div className="flex-1 min-w-0 overflow-y-auto">
                  {activeTab === "pins" && (
                    <VisualPinMapperTab
                      node={selectedNode}
                      onUpdateNode={(updates) =>
                        handleUpdateNode(selectedNode.key, updates)
                      }
                    />
                  )}

                  {activeTab === "code" && (
                    <ScriptCodeViewerTab
                      fileName={selectedNode.fileName}
                      sourceCode={fileContents[selectedNode.fileName] || ""}
                    />
                  )}

                  {activeTab === "impact" && (
                    <ImpactReconciliationTab
                      node={selectedNode}
                      strategy={nodeStrategies[selectedNode.key] ?? 0}
                      onStrategyChange={(val) =>
                        setNodeStrategies((prev) => ({ ...prev, [selectedNode.key]: val }))
                      }
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                Select a script slide from the sidebar to inspect and configure pins.
              </div>
            )}
          </div>

          {/* Sticky Bottom Actions Bar */}
          <IngestionFooterBar
            analyzedNodes={analyzedNodes}
            isPublishing={batchUpsertMutation.isPending}
            onPublish={handlePublishAll}
            onReset={handleReset}
          />
        </>
      )}
    </div>
  );
}
