import { useState } from "react";
import {
  FolderOpen,
  Plus,
  Trash2,
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
  Boxes,
  Zap,
  KeyRound,
  Cpu,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
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
import { featureFlags } from "@/config/featureFlags";
import { SUPPORTED_EXECUTOR_KEYS, getSoftwareMetadata } from "@/features/runners/constants/dccEngines";
import { ExecutorIcon } from "@/features/runners/components/ExecutorIcon";
import {
  useLocalWorkspaceConfig,
  useLocalPaletteQuery,
  useLocalPipelinesQuery,
} from "../../hooks/workspace";
import {
  useWorkspaceUiPrefsStore,
  useProjectUiPrefs,
} from "../../stores/useWorkspaceUiPrefsStore";
import type {
  LocalDraftNode,
  ScannedPipelineYamlItemRust,
} from "../../types/workspaceConfig";

interface LocalWorkspaceOutlinerProps {
  projectId: string;
  activeDraftPipeline?: ScannedPipelineYamlItemRust | null;
  activeTabId?: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onSelectScript?: (node: LocalDraftNode) => void;
  onSelectDraft?: (draft: ScannedPipelineYamlItemRust) => void;
  onOpenPalette?: () => void;
  onSyncPalette?: () => void;
  onOpenConfig?: () => void;
  onOpenConstants?: () => void;
  onOpenStructs?: () => void;
  onOpenPullDialog?: () => void;
  onOpenUnpackDialog?: () => void;
  isCreatingPipelineExternal?: boolean;
  onCreatingPipelineChange?: (open: boolean) => void;
}

export function LocalWorkspaceOutliner({
  projectId,
  activeDraftPipeline,
  activeTabId,
  collapsed = false,
  onToggleCollapse,
  onSelectDraft,
  onOpenPalette,
  onSyncPalette,
  onOpenConfig,
  onOpenConstants,
  onOpenStructs,
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
    isScanning,
    scanAndSyncScripts,
  } = useLocalPaletteQuery(rootPath, config?.scriptsDir, config?.ignorePatterns);

  const {
    componentPipes,
    masterPipelines,
    createPipeline,
    renamePipeline,
    duplicatePipeline,
    deletePipeline,
  } = useLocalPipelinesQuery(rootPath, config?.pipelinesDir);

  const uiPrefs = useProjectUiPrefs(projectId);
  const toggleSection = useWorkspaceUiPrefsStore((s) => s.toggleSection);
  const setSectionExpanded = useWorkspaceUiPrefsStore((s) => s.setSectionExpanded);
  const componentsExpanded = uiPrefs.sections.componentPipes;
  const masterExpanded = uiPrefs.sections.masterPipelines;
  const setComponentsExpanded = (val: boolean) => setSectionExpanded(projectId, "componentPipes", val);
  const setMasterExpanded = (val: boolean) => setSectionExpanded(projectId, "masterPipelines", val);

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

  const isStandaloneLocal = projectId === "local-default";
  const { studioSlug } = useCurrentStudio({ enabled: !isStandaloneLocal });
  const { data: studioQuota } = useStudioQuota(isStandaloneLocal ? undefined : studioSlug);
  const creditsRemaining = studioQuota?.executionCreditsRemaining ?? 50;

  const rootFolderName = rootPath ? rootPath.split(/[/\\]/).filter(Boolean).pop() || "Workspace" : "No Workspace";

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

  const paletteCount = Object.keys(draftNodes || {}).length;

  if (collapsed) {
    return (
      <div className="w-11 h-full flex flex-col items-center py-2.5 gap-1.5 bg-card/60 border-r border-border/60 select-none shrink-0">
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Expand Sidebar (Ctrl+B)"
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        )}
        <div className="w-5 h-px bg-border/60 my-0.5" />
        <button
          type="button"
          onClick={onOpenConstants}
          title="Constants"
          className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
            activeTabId === "singleton:constants"
              ? "bg-amber-500/15 text-amber-400"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <KeyRound className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onOpenPalette}
          title={`Node Palette (${paletteCount})`}
          className={`h-8 w-8 flex items-center justify-center rounded-md transition-colors cursor-pointer ${
            activeTabId === "singleton:palette"
              ? "bg-emerald-500/15 text-emerald-400"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          <Cpu className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => (onSyncPalette ? onSyncPalette() : scanAndSyncScripts())}
          disabled={isScanning}
          title="Sync Scripts"
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-emerald-400 hover:bg-muted/60 transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin text-emerald-500" : ""}`} />
        </button>
        <div className="w-5 h-px bg-border/60 my-0.5" />
        <button
          type="button"
          onClick={() => {
            setComponentsExpanded(true);
            onToggleCollapse?.();
          }}
          title={`Component Pipes (${componentPipes.length})`}
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <Layers className="h-4 w-4 text-amber-500/80" />
        </button>
        <button
          type="button"
          onClick={() => {
            setMasterExpanded(true);
            onToggleCollapse?.();
          }}
          title={`Master Pipelines (${masterPipelines.length})`}
          className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
        >
          <Workflow className="h-4 w-4 text-primary/80" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card/60 border-r border-border/60 w-64 shrink-0 select-none">
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
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="sm"
              onPress={onToggleCollapse}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              aria-label="Collapse Sidebar (Ctrl+B)"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Solo Dev Preview Quota Badge (hidden in standalone Local Mode until Quota phase) */}
      {!isStandaloneLocal && (
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
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2.5 space-y-3">
        {/* Top Navigation Items: Constants, Node Palette */}
        <div className="space-y-0.5 pb-2 border-b border-border/50">
          <button
            type="button"
            onClick={onOpenConstants}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTabId === "singleton:constants"
                ? "bg-amber-500/15 text-amber-400"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <KeyRound className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Constants</span>
          </button>

          <div
            onClick={onOpenPalette}
            className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
              activeTabId === "singleton:palette"
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Cpu className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Node Palette</span>
              <span className="text-[10px] font-mono text-muted-foreground">({paletteCount})</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onSyncPalette) onSyncPalette();
                else scanAndSyncScripts();
              }}
              disabled={isScanning}
              title="Sync & Scan Scripts"
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${isScanning ? "animate-spin text-emerald-500" : ""}`} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Section 1A: Component Pipes (Single DCC Units) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground px-1 py-1">
            <button
              onClick={() => toggleSection(projectId, "componentPipes")}
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
                      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs group transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-foreground"
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
              onClick={() => toggleSection(projectId, "masterPipelines")}
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
                      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs group transition-colors ${isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-foreground"
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

      </div>
    </div>
  );
}
