import { useEffect, useState } from "react";
import {
  Laptop,
  RefreshCw,
  Settings2,
  FileCode2,
  Workflow,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocalWorkspaceStore } from "../stores/useLocalWorkspaceStore";
import { LocalWorkspaceEmptyState } from "../components/workspace/LocalWorkspaceEmptyState";
import { LocalWorkspaceOutliner } from "../components/workspace/LocalWorkspaceOutliner";
import { WorkspaceConfigDialog } from "../components/workspace/WorkspaceConfigDialog";
import { LocalScriptSyncSheet } from "../components/workspace/LocalScriptSyncSheet";
import type { LocalDraftNode, ScannedPipelineYamlItemRust } from "../types/workspaceConfig";

interface LocalWorkspacePageProps {
  projectId: string;
}

export function LocalWorkspacePage({ projectId }: LocalWorkspacePageProps) {
  const {
    config,
    draftNodes,
    isScanning,
    isLoading,
    initWorkspace,
    scanAndSyncScripts,
    scanDraftPipelines,
    activeDraftPipeline,
    setActiveDraftPipeline,
  } = useLocalWorkspaceStore();

  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [syncSheetOpen, setSyncSheetOpen] = useState(false);
  const [syncSheetInitialKey, setSyncSheetInitialKey] = useState<string | undefined>();
  const [selectedScript, setSelectedScript] = useState<LocalDraftNode | null>(null);

  useEffect(() => {
    if (projectId) {
      initWorkspace(projectId).then(() => {
        scanDraftPipelines();
      });
    }
  }, [projectId, initWorkspace, scanDraftPipelines]);

  const scriptFolders = config?.scriptFolders ?? [];
  const hasConfiguredFolders = scriptFolders.length > 0;
  const draftNodeList = Object.values(draftNodes);

  const handleSelectScript = (node: LocalDraftNode) => {
    setSelectedScript(node);
  };

  const handleOpenSyncAndReview = async (scriptKey?: string) => {
    setSyncSheetInitialKey(scriptKey);
    try {
      await scanAndSyncScripts();
    } catch {
      // Continue opening review sheet even if some warnings occurred
    }
    setSyncSheetOpen(true);
  };

  const handleSelectDraft = (draft: ScannedPipelineYamlItemRust) => {
    setActiveDraftPipeline(draft);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!hasConfiguredFolders) {
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
      />

      {/* Main Workbench Area */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {/* Top Workbench Toolbar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-card/40 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Laptop className="h-5 w-5 text-emerald-500 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold tracking-tight text-foreground truncate flex items-center gap-2">
                {activeDraftPipeline ? activeDraftPipeline.fileName : "Local Workbench"}
                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-1.5 py-0">
                  Draft Mode
                </Badge>
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onPress={() => handleOpenSyncAndReview()}
              isDisabled={isScanning}
              className="gap-1.5 text-xs h-8"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin text-emerald-500" : ""}`} />
              Sync & Review Scripts
            </Button>

            <Button
              variant="outline"
              size="sm"
              onPress={() => setConfigDialogOpen(true)}
              className="gap-1.5 text-xs h-8"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Folders Config
            </Button>
          </div>
        </div>

        {/* Center Content / Workbench Canvas Area */}
        <div className="flex-1 min-h-0 relative bg-background/50 flex flex-col items-center justify-center p-8 text-center select-none">
          {activeDraftPipeline ? (
            <div className="max-w-md space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary mx-auto">
                <Workflow className="h-7 w-7" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {activeDraftPipeline.fileName}
              </h3>
              <p className="text-xs text-muted-foreground font-mono bg-muted/50 p-2 rounded border border-border/60">
                {activeDraftPipeline.fullPath}
              </p>
              <p className="text-xs text-muted-foreground">
                Draft pipeline ready for in-memory execution or visual canvas authoring.
              </p>
            </div>
          ) : selectedScript ? (
            <div className="max-w-lg space-y-3 text-left bg-card/60 p-6 rounded-xl border border-border/60 shadow-sm">
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
                      <li key={p.name} className="truncate">• {p.name}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-muted/40 p-2.5 rounded border border-border/40">
                  <span className="font-semibold text-foreground block mb-1">
                    Outputs ({selectedScript.outputs?.length || 0})
                  </span>
                  <ul className="space-y-0.5 text-muted-foreground font-mono text-[11px]">
                    {selectedScript.outputs?.map((p: any) => (
                      <li key={p.name} className="truncate">• {p.name}</li>
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
                  <Sparkles className="h-3.5 w-3.5" />
                  Inspect AST Pins & Code
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-md space-y-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto">
                <Sparkles className="h-7 w-7" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                Local Workspace Ready
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Select a script from the Outliner to view extracted AST pins, or select a .pipeline.yaml
                draft to compose visual execution steps.
              </p>
              <div className="flex items-center justify-center gap-2 pt-2">
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {draftNodeList.length} local tools loaded
                </Badge>
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  Zero DB footprint
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
    </div>
  );
}
