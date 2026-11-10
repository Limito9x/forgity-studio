import { useState } from "react";
import {
  Folder,
  Plus,
  Trash2,
  FileCode,
  Workflow,
  ChevronDown,
  ChevronRight,
  HardDrive,
  RefreshCw,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { openNativeFileOrFolderDialog, isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import { useLocalWorkspaceStore } from "../../stores/useLocalWorkspaceStore";
import type { LocalDraftNode, ScannedPipelineYamlItemRust } from "../../types/workspaceConfig";

interface LocalWorkspaceOutlinerProps {
  onSelectScript?: (node: LocalDraftNode) => void;
  onSelectDraft?: (draft: ScannedPipelineYamlItemRust) => void;
  onOpenSyncSheet?: () => void;
}

export function LocalWorkspaceOutliner({
  onSelectScript,
  onSelectDraft,
  onOpenSyncSheet,
}: LocalWorkspaceOutlinerProps) {
  const {
    config,
    draftNodes,
    scannedDraftPipelines,
    activeDraftPipeline,
    isScanning,
    addScriptFolder,
    removeScriptFolder,
    toggleScriptFolder,
    scanAndSyncScripts,
  } = useLocalWorkspaceStore();

  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [scriptsExpanded, setScriptsExpanded] = useState(true);
  const [draftsExpanded, setDraftsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const scriptFolders = config?.scriptFolders ?? [];
  const draftNodeList = Object.values(draftNodes);

  const filteredNodes = draftNodeList.filter(
    (n) =>
      n.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.suggestedLabel.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.namespace.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddFolder = async () => {
    if (!isTauriRuntime()) return;
    try {
      const selectedPath = await openNativeFileOrFolderDialog({
        mode: "folder",
        title: "Add Watched Script Folder",
      });
      if (!selectedPath) return;

      const parts = selectedPath.split(/[/\\\\]/);
      const folderName = parts[parts.length - 1] || "custom";
      const cleanNamespace = folderName.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "custom";

      await addScriptFolder({
        namespace: cleanNamespace,
        path: selectedPath,
        enabled: true,
      });

      await scanAndSyncScripts();
    } catch (err) {
      console.error("[LocalWorkspaceOutliner] Failed to add folder:", err);
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
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <HardDrive className="h-3.5 w-3.5 text-emerald-500" />
          Local Outliner
        </span>
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

      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {/* Section 1: Watched Folders */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground px-1 py-1">
            <button
              onClick={() => setFoldersExpanded(!foldersExpanded)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {foldersExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Watched Folders ({scriptFolders.length})</span>
            </button>
            <Button
              variant="ghost"
              size="sm"
              onPress={handleAddFolder}
              className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
              aria-label="Add Watched Folder"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {foldersExpanded && (
            <div className="space-y-1 pl-1">
              {scriptFolders.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-2 py-1 italic">
                  No folders watched yet.
                </p>
              ) : (
                scriptFolders.map((f) => (
                  <div
                    key={f.path}
                    className="flex items-center justify-between group px-2 py-1.5 rounded-md hover:bg-muted/50 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={f.enabled}
                        onChange={(e) => toggleScriptFolder(f.path, e.target.checked)}
                        className="rounded border-border text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                      />
                      <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate font-mono text-[11px] text-foreground" title={f.path}>
                        {f.path}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                        {f.namespace}
                      </Badge>
                      <button
                        onClick={() => removeScriptFolder(f.path)}
                        className="opacity-0 group-hover:opacity-100 hover:text-destructive text-muted-foreground p-0.5 transition-opacity"
                        title="Remove Folder"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Section 2: Scanned Local Scripts */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground px-1 py-1">
            <button
              onClick={() => setScriptsExpanded(!scriptsExpanded)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {scriptsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Local Palette Nodes ({draftNodeList.length})</span>
            </button>
            {draftNodeList.length > 0 && (
              <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 px-1 py-0 h-4">
                Ready
              </Badge>
            )}
          </div>

          {scriptsExpanded && (
            <div className="space-y-1.5 pl-1">
              {draftNodeList.length > 5 && (
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
                  No scripts discovered. Click Sync to scan.
                </p>
              ) : (
                filteredNodes.map((node) => (
                  <div
                    key={node.key}
                    onClick={() => onSelectScript?.(node)}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted/60 cursor-pointer text-xs group transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0 group-hover:text-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground font-medium text-[11px]">
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
                ))
              )}
            </div>
          )}
        </div>

        {/* Section 3: Draft Pipelines (.pipeline.yaml) */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-foreground px-1 py-1">
            <button
              onClick={() => setDraftsExpanded(!draftsExpanded)}
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              {draftsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span>Draft Pipelines ({scannedDraftPipelines.length})</span>
            </button>
          </div>

          {draftsExpanded && (
            <div className="space-y-1 pl-1">
              {scannedDraftPipelines.length === 0 ? (
                <p className="text-[11px] text-muted-foreground px-2 py-1 italic">
                  No .pipeline.yaml files found in primary folder.
                </p>
              ) : (
                scannedDraftPipelines.map((draft) => {
                  const isActive = activeDraftPipeline?.fullPath === draft.fullPath;
                  return (
                    <div
                      key={draft.fullPath}
                      onClick={() => onSelectDraft?.(draft)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                        isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-foreground"
                      }`}
                    >
                      <Workflow className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate text-[11px] flex-1 font-mono">{draft.fileName}</span>
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

