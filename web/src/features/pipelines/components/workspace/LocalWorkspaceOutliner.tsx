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
  CloudDownload,
  Package,
  Layers,
  Sparkles,
  Boxes,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { openNativeFileOrFolderDialog, isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import { useDialogStore } from "@/stores/dialogStore";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import { useStudioQuota } from "@/features/studios/hooks/useStudioQuota";
import { generateLocalStructPaletteItems } from "../../utils/structPaletteGenerator";
import { featureFlags } from "@/config/featureFlags";
import { SUPPORTED_EXECUTOR_KEYS, getSoftwareMetadata } from "@/features/runners/constants/dccEngines";
import { ExecutorIcon } from "@/features/runners/components/ExecutorIcon";
import { useLocalWorkspaceConfig, useLocalPaletteQuery, useLocalPipelinesQuery } from "../../hooks/workspace";
import { formatNodeLabel } from "../../utils/labelFormatter";
import type { LocalDraftNode, ScannedPipelineYamlItemRust } from "../../types/workspaceConfig";

interface LocalWorkspaceOutlinerProps {
  projectId: string;
  activeDraftPipeline?: ScannedPipelineYamlItemRust | null;
  onSelectScript?: (node: LocalDraftNode) => void;
  onSelectDraft?: (draft: ScannedPipelineYamlItemRust) => void;
  onOpenSyncSheet?: () => void;
  onOpenConfig?: () => void;
  onOpenPullDialog?: () => void;
  onOpenUnpackDialog?: () => void;
  isCreatingPipelineExternal?: boolean;
  onCreatingPipelineChange?: (open: boolean) => void;
}

export function LocalWorkspaceOutliner({
  projectId,
  activeDraftPipeline,
  onSelectScript,
  onSelectDraft,
  onOpenSyncSheet,
  onOpenConfig,
  onOpenPullDialog,
  onOpenUnpackDialog,
  isCreatingPipelineExternal,
  onCreatingPipelineChange,
}: LocalWorkspaceOutlinerProps) {
  const {
    rootPath,
    config,
    switchRootFolder,
  } = useLocalWorkspaceConfig(projectId);

  const {
    draftNodes,
    localStructs,
    isScanning,
    scanAndSyncScripts,
    clearPalette,
    deleteLocalStruct,
  } = useLocalPaletteQuery(rootPath, config?.scriptsDir);

  const {
    componentPipes,
    masterPipelines,
    createPipeline,
    renamePipeline,
    duplicatePipeline,
    deletePipeline,
  } = useLocalPipelinesQuery(rootPath, config?.pipelinesDir);

  const [scriptsExpanded, setScriptsExpanded] = useState(true);
  const [componentsExpanded, setComponentsExpanded] = useState(true);
  const [masterExpanded, setMasterExpanded] = useState(true);
  const [structsExpanded, setStructsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Pipeline rename dialog state
  const [renamingDraft, setRenamingDraft] = useState<ScannedPipelineYamlItemRust | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Pipeline create state
  const [internalCreatingPipeline, setInternalCreatingPipeline] = useState(false);
  const isCreatingPipeline = isCreatingPipelineExternal ?? internalCreatingPipeline;
  const setIsCreatingPipeline = (val: boolean) => {
    setInternalCreatingPipeline(val);
    onCreatingPipelineChange?.(val);
  };

  const [createKind, setCreateKind] = useState<"component" | "master">("master");
  const [createExecutor, setCreateExecutor] = useState<string>("blender");
  const [newPipelineName, setNewPipelineName] = useState("");

  const { studioSlug } = useCurrentStudio();
  const { data: studioQuota } = useStudioQuota(studioSlug);
  const creditsRemaining = studioQuota?.executionCreditsRemaining ?? 50;

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
        await switchRootFolder(selectedPath);
      }
    } catch (err: any) {
      toast.error("Failed to switch workspace", { description: err?.message });
    }
  };

  const handleClearPalette = async () => {
    try {
      await clearPalette();
      toast.success("Local palette cleared from disk!");
    } catch (err: any) {
      toast.error("Failed to clear palette", { description: err?.message });
    }
  };

  const handleCreatePipelineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPipelineName.trim()) return;

    try {
      const created = await createPipeline({
        name: newPipelineName.trim(),
        kind: createKind,
        executor: createKind === "component" ? createExecutor : undefined,
      });
      setIsCreatingPipeline(false);
      setNewPipelineName("");
      toast.success(`Created ${createKind === "component" ? "Component Pipe" : "Master Pipeline"}!`);
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
      await renamePipeline({
        filePath: renamingDraft.fullPath,
        newName: renameValue.trim(),
      });
      toast.success("Pipeline renamed!");
      setRenamingDraft(null);
    } catch (err: any) {
      toast.error("Failed to rename pipeline", { description: err?.message });
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, draft: ScannedPipelineYamlItemRust) => {
    e.stopPropagation();
    try {
      const duplicated = await duplicatePipeline(draft.fullPath);
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
      await deletePipeline(draft.fullPath);
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
            onPress={() => {
              if (onOpenSyncSheet) onOpenSyncSheet();
              else scanAndSyncScripts();
            }}
            isDisabled={isScanning}
            className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3 w-3 ${isScanning ? "animate-spin text-emerald-500" : ""}`} />
            Sync
          </Button>
        </div>
      </div>

      {/* Solo Dev Preview Quota Badge */}
      <div className="px-3 py-1.5 bg-muted/20 border-b border-border/40 flex items-center justify-between text-[11px]">
        <button
          onClick={() => useDialogStore.getState().openDialog("upgrade-plan", { quota: studioQuota })}
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <Zap className={`h-3 w-3 ${creditsRemaining <= 5 ? "text-amber-500 fill-amber-500" : "text-primary"}`} />
          <span>Solo Preview:</span>
          <span className={`font-mono font-semibold ${creditsRemaining <= 0 ? "text-destructive" : "text-foreground"}`}>
            {creditsRemaining}/50 Runs
          </span>
        </button>
        <button
          onClick={() => useDialogStore.getState().openDialog("upgrade-plan", { quota: studioQuota })}
          className="text-[10px] font-medium text-primary hover:underline cursor-pointer"
        >
          {creditsRemaining <= 0 ? "Upgrade" : "Plan"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Section 1A: Component Pipes (Single DCC Units) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground px-1 py-1">
            <button
              onClick={() => setComponentsExpanded(!componentsExpanded)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {componentsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Component Pipes ({componentPipes.length})</span>
            </button>
            <div className="flex items-center gap-1">
              <span title="New Component Pipe (Single DCC)">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setIsCreatingPipeline(true);
                    setCreateKind("component");
                    setComponentsExpanded(true);
                  }}
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="New Component Pipe"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </span>
            </div>
          </div>

          {componentsExpanded && (
            <div className="space-y-1 pl-1">
              {isCreatingPipeline && createKind === "component" && (
                <form onSubmit={handleCreatePipelineSubmit} className="space-y-1.5 p-2 rounded-lg bg-muted/30 border border-border/60">
                  <Input
                    autoFocus
                    value={newPipelineName}
                    onChange={(e) => setNewPipelineName(e.target.value)}
                    placeholder="Component name (e.g. Daz Bake)..."
                    className="h-7 text-xs bg-background"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground shrink-0">Executor:</span>
                    <Select
                      selectedKey={createExecutor}
                      onSelectionChange={(key) => {
                        if (key) setCreateExecutor(key.toString());
                      }}
                      className="flex-1"
                    >
                      <SelectTrigger className="h-6 text-[11px] font-medium bg-background border-border/80 px-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent placement="bottom start">
                        {SUPPORTED_EXECUTOR_KEYS.map((execKey) => {
                          const meta = getSoftwareMetadata(execKey);
                          return (
                            <SelectItem key={execKey} id={execKey} textValue={meta.name || execKey}>
                              <div className="flex items-center gap-1.5 text-xs py-0.5">
                                <ExecutorIcon executor={execKey} className="size-3.5" />
                                <span>{meta.name || execKey}</span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center justify-end gap-1 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onPress={() => setIsCreatingPipeline(false)}
                      className="h-6 px-2 text-[10px]"
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" className="h-6 px-2.5 text-[10px] bg-primary text-primary-foreground">
                      Create
                    </Button>
                  </div>
                </form>
              )}

              {componentPipes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-2 py-1 italic">
                  No component pipes yet. Click + to create a single-DCC pipe.
                </p>
              ) : (
                componentPipes.map((draft) => {
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
                        <Boxes className="h-3.5 w-3.5 shrink-0 text-amber-500 group-hover:text-primary" />
                        <span className="truncate text-[11px] font-mono">{draft.fileName}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {draft.executor && (
                          <Badge variant="outline" className={`text-[8px] px-1 py-0 h-3.5 ${getExecutorColor(draft.executor)}`}>
                            {draft.executor}
                          </Badge>
                        )}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => handleStartRename(e, draft)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground"
                            title="Rename"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDuplicate(e, draft)}
                            className="p-1 rounded text-muted-foreground hover:text-foreground"
                            title="Duplicate"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(e, draft)}
                            className="p-1 rounded text-muted-foreground hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Section 1B: Master Pipelines (Production Orchestration) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground px-1 py-1">
            <button
              onClick={() => setMasterExpanded(!masterExpanded)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {masterExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Master Pipelines ({masterPipelines.length})</span>
            </button>
            <div className="flex items-center gap-1">
              {featureFlags.enableStudioCatalog && onOpenPullDialog && (
                <span title="Pull Pipeline from Studio">
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={onOpenPullDialog}
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-primary transition-colors"
                    aria-label="Pull from Studio"
                  >
                    <CloudDownload className="h-3.5 w-3.5" />
                  </Button>
                </span>
              )}
              {featureFlags.enableStudioCatalog && onOpenUnpackDialog && (
                <span title="Import Package (.json)">
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={onOpenUnpackDialog}
                    className="h-5 w-5 p-0 text-muted-foreground hover:text-emerald-500 transition-colors"
                    aria-label="Import Package"
                  >
                    <Package className="h-3.5 w-3.5" />
                  </Button>
                </span>
              )}
              <span title="New Master Pipeline">
                <Button
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    setIsCreatingPipeline(true);
                    setCreateKind("master");
                    setMasterExpanded(true);
                  }}
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="New Master Pipeline"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </span>
            </div>
          </div>

          {masterExpanded && (
            <div className="space-y-1 pl-1">
              {isCreatingPipeline && createKind === "master" && (
                <form onSubmit={handleCreatePipelineSubmit} className="flex items-center gap-1 px-1 py-1">
                  <Input
                    autoFocus
                    value={newPipelineName}
                    onChange={(e) => setNewPipelineName(e.target.value)}
                    placeholder="Master pipeline name..."
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

              {masterPipelines.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-2 py-1 italic">
                  No master pipelines. Click + to assemble components.
                </p>
              ) : (
                masterPipelines.map((draft) => {
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
                          label: formatNodeLabel(node.suggestedLabel || node.fileName),
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
                          {formatNodeLabel(node.suggestedLabel || node.fileName)}
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

        {/* Section 3: Local Structs (.forgity/local_structs.json) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground px-1 py-1">
            <button
              onClick={() => setStructsExpanded(!structsExpanded)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {structsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Local Structs ({localStructs.length})</span>
            </button>
            <div className="flex items-center gap-1">
              <span title="Auto-detected from script TypedDict / @dataclass schemas">
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-primary/10 text-primary border-primary/20">
                  <Sparkles className="h-2.5 w-2.5 mr-0.5 inline" /> Pure
                </Badge>
              </span>
            </div>
          </div>

          {structsExpanded && (
            <div className="space-y-1.5 pl-1">
              {localStructs.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-2 py-1 italic">
                  No structs detected. Define TypedDict or @dataclass in scripts and click Sync.
                </p>
              ) : (
                localStructs.map((struct) => {
                  const paletteItems = generateLocalStructPaletteItems([struct]);
                  const makeNode = paletteItems.find((p) => p.key.includes(":make:"));
                  const breakNode = paletteItems.find((p) => p.key.includes(":break:"));

                  return (
                    <div
                      key={struct.slug}
                      className="p-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => useDialogStore.getState().openDialog("workspace-struct-preview", { struct })}
                          className="flex items-center gap-1.5 min-w-0 text-left hover:text-primary transition-colors"
                        >
                          <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="text-xs font-semibold text-foreground truncate">
                            {struct.displayName || struct.slug}
                          </span>
                        </button>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {struct.fields.length} {struct.fields.length === 1 ? "field" : "fields"}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onPress={async () => {
                              try {
                                await deleteLocalStruct(struct.slug);
                                toast.success(`Deleted struct ${struct.slug}`);
                              } catch (err: any) {
                                toast.error("Failed to delete struct", { description: err?.message });
                              }
                            }}
                            className="h-4 w-4 p-0 text-muted-foreground hover:text-destructive transition-colors ml-1"
                            aria-label="Delete Struct"
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Drag-drop pure companion chips */}
                      <div className="flex items-center gap-1.5 pt-0.5">
                        {makeNode && (
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "application/forgity-node",
                                JSON.stringify(makeNode)
                              );
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-[10px] font-medium cursor-grab active:cursor-grabbing select-none transition-colors"
                            title="Drag onto Canvas to pack fields into struct"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            <span>Make</span>
                          </div>
                        )}
                        {breakNode && (
                          <div
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "application/forgity-node",
                                JSON.stringify(breakNode)
                              );
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/20 text-[10px] font-medium cursor-grab active:cursor-grabbing select-none transition-colors"
                            title="Drag onto Canvas to unpack struct into fields"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            <span>Break</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
