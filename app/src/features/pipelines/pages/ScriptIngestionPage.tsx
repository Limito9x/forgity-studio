import { useState, useCallback } from "react";
import { ArrowLeft, Sparkles, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useAnalyzeCustomNodesBatchMutation,
  type AnalyzedCustomNodeDto,
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
import { useScriptBatchPublish, type ScriptSource } from "../hooks/useScriptBatchPublish";
import { ScriptGuidelinesDialog } from "../dialogs/ScriptGuidelinesDialog";
import { useProjectNav } from "@/lib/navigation/useProjectNav";

interface ScriptIngestionPageProps {
  projectId: string;
}

export function ScriptIngestionPage({ projectId }: ScriptIngestionPageProps) {
  const nav = useProjectNav({ projectId });

  const [guidelinesOpen, setGuidelinesOpen] = useState(false);
  const [analyzedNodes, setAnalyzedNodes] = useState<AnalyzedCustomNodeDto[]>([]);
  const [scriptSources, setScriptSources] = useState<Record<string, ScriptSource>>({});
  const [isPreparingScripts, setIsPreparingScripts] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<IngestionActiveTab>("pins");
  const [nodeStrategies, setNodeStrategies] = useState<Record<string, number>>({});

  const analyzeMutation = useAnalyzeCustomNodesBatchMutation();
  const publisher = useScriptBatchPublish(projectId);

  const processFiles = useCallback(
    async (files: File[]) => {
      if (isPreparingScripts || publisher.isPublishing) return;
      const pythonFiles = files.filter((f) => f.name.toLowerCase().endsWith(".py"));
      if (pythonFiles.length === 0) {
        toast.error("Please provide valid Python (.py) script files.");
        return;
      }

      try {
        setIsPreparingScripts(true);
        const readFiles = await Promise.all(
          pythonFiles.map(async (file) => ({
            fileName: file.name,
            scriptContent: await file.text(),
          }))
        );
        if (new Set(readFiles.map(f => f.fileName)).size !== readFiles.length) {
          throw new Error("Script filenames must be unique within an upload.");
        }
        const result = await analyzeMutation.mutateAsync({
          data: { projectId, scripts: readFiles },
        });

        if (result?.nodes && result.nodes.length > 0) {
          const sources = Object.fromEntries(result.nodes.map(node => {
            const source = readFiles.find(file => file.fileName === node.fileName)!;
            return [node.key, { fileName: source.fileName, content: source.scriptContent, contentHash: node.contentHash }];
          }));
          setScriptSources(prev => ({ ...prev, ...sources }));
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
      } finally {
        setIsPreparingScripts(false);
      }
    },
    [projectId, analyzeMutation, isPreparingScripts, publisher.isPublishing]
  );

  const handleUpdateNode = (key: string, updates: Partial<AnalyzedCustomNodeDto>) => {
    if (publisher.isPublishing) return;
    setAnalyzedNodes((prev) =>
      prev.map((n) => (n.key === key ? { ...n, ...updates, key: n.key, fileName: n.fileName, contentHash: n.contentHash } : n))
    );
  };

  const handleRemoveNode = (key: string) => {
    if (publisher.isPublishing) return;
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
    setScriptSources({});
    publisher.reset();
    setSelectedIndex(0);
    setNodeStrategies({});
  };

  const handlePublishAll = async () => {
    if (analyzedNodes.length === 0 || publisher.isPublishing || isPreparingScripts) return;

    const published = await publisher.publish(analyzedNodes, scriptSources, nodeStrategies);
    const remaining = analyzedNodes.filter(node => !published.has(node.key));
    setAnalyzedNodes(remaining);
    setSelectedIndex(0);
    if (remaining.length === 0) {
      handleReset();
      nav.toNodes();
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
            onPress={() => nav.toNodes()}
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

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shadow-xs"
            onPress={() => setGuidelinesOpen(true)}
          >
            <BookOpen className="size-3.5 text-primary" />
            Script Guidelines
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      {analyzedNodes.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <IngestionDropzone
            onFilesDropped={processFiles}
            isAnalyzing={isPreparingScripts || analyzeMutation.isPending}
            onOpenGuidelines={() => setGuidelinesOpen(true)}
          />
        </div>
      ) : (
        <>
          <div inert={publisher.isPublishing || isPreparingScripts} className={`flex-1 flex min-w-0 overflow-hidden ${publisher.isPublishing || isPreparingScripts ? "opacity-70" : ""}`}>
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
                {publisher.errors[selectedNode.key] && (
                  <p role="alert" className="px-6 py-3 text-sm text-destructive border-b border-border">
                    {publisher.errors[selectedNode.key]}
                  </p>
                )}
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
                      sourceCode={scriptSources[selectedNode.key]?.content || ""}
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
            isPublishing={publisher.isPublishing || isPreparingScripts}
            onPublish={handlePublishAll}
            onReset={handleReset}
          />
        </>
      )}

      {/* Script Standards & Registry Guidelines Modal */}
      <ScriptGuidelinesDialog
        isOpen={guidelinesOpen}
        onClose={() => setGuidelinesOpen(false)}
      />
    </div>
  );
}
