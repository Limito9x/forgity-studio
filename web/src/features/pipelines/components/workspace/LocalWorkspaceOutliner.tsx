import { useState } from "react";
import {
  FolderOpen,
  Plus,
  Trash2,
  FileCode,
  Workflow,
  ChevronDown,
  ChevronRight,
  HardDrive,
  RefreshCw,
  Copy,
  Pencil,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { openNativeFileOrFolderDialog, isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import { useLocalWorkspaceStore } from "../../stores/useLocalWorkspaceStore";
import type { LocalDraftNode, ScannedPipelineYamlItemRust } from "../../types/workspaceConfig";

interface LocalWorkspaceOutlinerProps {
  onSelectScript?: (node: LocalDraftNode) => void;
  onSelectDraft?: (draft: ScannedPipelineYamlItemRust) => void;
  onOpenSyncSheet?: () => void;
  onOpenConfig?: () => void;
}

export function LocalWorkspaceOutliner({
  onSelectScript,
  onSelectDraft,
  onOpenSyncSheet,
  onOpenConfig,
}: LocalWorkspaceOutlinerProps) {
  const {
    rootPath,
    config,
    draftNodes,
    scannedDraftPipelines,
    activeDraftPipeline,
    isScanning,
    openWorkspaceRoot,
    clearLocalPalette,
    scanAndSyncScripts,
    createPipelineDraft,
    renamePipelineDraft,
    duplicatePipelineDraft,
    deletePipelineDraft,
  } = useLocalWorkspaceStore();

  const [scriptsExpanded, setScriptsExpanded] = useState(true);
  const [draftsExpanded, setDraftsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Pipeline rename dialog state
  const [renamingDraft, setRenamingDraft] = useState<ScannedPipelineYamlItemRust | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Pipeline create state
  const [isCreatingPipeline, setIsCreatingPipeline] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");

  const draftNodeList = Object.values(draftNodes);
  const rootFolderName = rootPath ? rootPath.split(/[/\\]/).filter(Boolean).pop() || "Workspace" : "No Workspace";

  const filteredNodes = draftNodeList.filter(
    (n) =>
      n.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.suggestedLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.key.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePickOtherRoot = async () => {
    if (!isTauriRuntime()) return;
    try {
      const selectedPath = await openNativeFileOrFolderDialog({
        mode: "folder",
        title: "Open Workspace Root Folder",
      });
      if (selectedPath) {
        await openWorkspaceRoot(selectedPath);
      }
    } catch (err: any) {
      toast.error("Failed to switch workspace", { description: err?.message });
    }
  };

  const handleClearPalette = async () => {
    try {
      await clearLocalPalette();
      toast.success("Local palette cleared from disk!");
    } catch (err: any) {
      toast.error("Failed to clear palette", { description: err?.message });
    }
  };

  const handleCreatePipelineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPipelineName.trim()) return;

    try {
      const created = await createPipelineDraft(newPipelineName.trim());
      setIsCreatingPipeline(false);
      setNewPipelineName("");
      toast.success("Created pipeline draft!");
      if (created) {
        onSelectDraft?.(created);
      }
    } catch (err: any) {
      toast.error("Failed to create pipeline", { description: err?.message });
    }
  };

  const handleStartRename = (e: React.MouseEvent, draft: ScannedPipelineYamlItemRust) => {
    e.stopPropagation();
    setRenamingDraft(draft);
    setRenameValue(draft.fileName.replace(/\.pipeline\.(yaml|yml)$/, ""));
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renamingDraft || !renameValue.trim()) return;

    try {
      await renamePipelineDraft(renamingDraft.fullPath, renameValue.trim());
      toast.success("Pipeline renamed!");
      setRenamingDraft(null);
    } catch (err: any) {
      toast.error("Failed to rename pipeline", { description: err?.message });
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, draft: ScannedPipelineYamlItemRust) => {
    e.stopPropagation();
    try {
      const duplicated = await duplicatePipelineDraft(draft.fullPath);
      toast.success("Pipeline duplicated!");
      if (duplicated) {
        onSelectDraft?.(duplicated);
      }
    } catch (err: any) {
      toast.error("Failed to duplicate pipeline", { description: err?.message });
    }
  };

  const handleDelete = async (e: React.MouseEvent, draft: ScannedPipelineYamlItemRust) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${draft.fileName}"?`)) return;

    try {
      await deletePipelineDraft(draft.fullPath);
      toast.success("Pipeline deleted from disk!");
    } catch (err: any) {
      toast.error("Failed to delete pipeline", { description: err?.message });
    }
  };

  const getExecutorColor = (executor: string) => {
    const ex = executor.toLowerCase();
    if (ex.includes("blender")) return "bg-orange-500/10 text-orange-500 border-orange-500/20";
    if (ex.includes("unreal")) return "bg-sky-500/10 text-sky-500 border-sky-500/20";
    return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
  };

  return (
    <div className="flex flex-col h-full bg-card/60 border-r border-border/60 w-80 shrink-0 select-none">
      {/* Root Workspace Header bar */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <HardDrive className="h-4 w-4 text-emerald-500 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground truncate" title={rootPath || undefined}>
              {rootFolderName}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {config?.scriptsDir || "scripts"} • {config?.pipelinesDir || "pipelines"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          <Button
            variant="ghost"
            size="sm"
            onPress={handlePickOtherRoot}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Open Workspace Folder"
          >
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={onOpenConfig}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            aria-label="Workspace Settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={onOpenSyncSheet || scanAndSyncScripts}
            isDisabled={isScanning}
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3 w-3 ${isScanning ? "animate-spin text-emerald-500" : ""}`} />
            Sync
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Section 1: Pipelines (.pipeline.yaml) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground px-1 py-1">
            <button
              onClick={() => setDraftsExpanded(!draftsExpanded)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {draftsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Pipelines ({scannedDraftPipelines.length})</span>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setIsCreatingPipeline(true)}
              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
              aria-label="New Pipeline"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {draftsExpanded && (
            <div className="space-y-1 pl-1">
              {isCreatingPipeline && (
                <form onSubmit={handleCreatePipelineSubmit} className="flex items-center gap-1 px-1 py-1">
                  <Input
                    autoFocus
                    value={newPipelineName}
                    onChange={(e) => setNewPipelineName(e.target.value)}
                    placeholder="Pipeline name..."
                    className="h-6 text-xs bg-background"
                  />
                  <Button type="submit" size="sm" className="h-6 px-2 text-[10px]">
                    Create
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onPress={() => setIsCreatingPipeline(false)}
                    className="h-6 px-1.5 text-[10px]"
                  >
                    Cancel
                  </Button>
                </form>
              )}

              {scannedDraftPipelines.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-2 py-1 italic">
                  No .pipeline.yaml files. Click + to create one.
                </p>
              ) : (
                scannedDraftPipelines.map((draft) => {
                  const isActive = activeDraftPipeline?.fullPath === draft.fullPath;
                  const isRenaming = renamingDraft?.fullPath === draft.fullPath;

                  if (isRenaming) {
                    return (
                      <form key={draft.fullPath} onSubmit={handleRenameSubmit} className="flex items-center gap-1 px-1 py-1">
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="h-6 text-xs bg-background"
                        />
                        <Button type="submit" size="sm" className="h-6 px-2 text-[10px]">
                          Save
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onPress={() => setRenamingDraft(null)}
                          className="h-6 px-1.5 text-[10px]"
                        >
                          Cancel
                        </Button>
                      </form>
                    );
                  }

                  return (
                    <div
                      key={draft.fullPath}
                      onClick={() => onSelectDraft?.(draft)}
                      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs group transition-colors ${
                        isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Workflow className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                        <span className="truncate text-[11px] font-mono">{draft.fileName}</span>
                      </div>

                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => handleStartRename(e, draft)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground"
                          title="Rename pipeline"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDuplicate(e, draft)}
                          className="p-1 rounded text-muted-foreground hover:text-foreground"
                          title="Duplicate pipeline"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, draft)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive"
                          title="Delete pipeline"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Section 2: Local Palette Scripts */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground px-1 py-1">
            <button
              onClick={() => setScriptsExpanded(!scriptsExpanded)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {scriptsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Local Palette Nodes ({draftNodeList.length})</span>
            </button>
            <div className="flex items-center gap-1.5">
              {draftNodeList.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={handleClearPalette}
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Clear Local Palette"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>

          {scriptsExpanded && (
            <div className="space-y-1 pl-1">
              {draftNodeList.length > 6 && (
                <div className="px-1 py-1">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter scripts..."
                    className="h-7 text-xs bg-background/50"
                  />
                </div>
              )}

              {filteredNodes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-2 py-1 italic">
                  {draftNodeList.length === 0 ? "No palette saved. Click Sync to scan scripts." : "No matching scripts."}
                </p>
              ) : (
                filteredNodes.map((node) => (
                  <div
                    key={node.key}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/forgity-node",
                        JSON.stringify({
                          key: `local:${node.key}`,
                          label: node.suggestedLabel || node.fileName,
                          category: "Local Scripts",
                          executor: node.executor,
                          inputs: node.inputs || [],
                          outputs: node.outputs || [],
                          source: "LocalDraft",
                        })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => onSelectScript?.(node)}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/60 cursor-grab active:cursor-grabbing text-xs group transition-colors select-none"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground font-medium text-[11px]">
                          {node.suggestedLabel || node.fileName}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate font-mono">
                          {node.key}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${getExecutorColor(node.executor)}`}>
                      {node.executor}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
