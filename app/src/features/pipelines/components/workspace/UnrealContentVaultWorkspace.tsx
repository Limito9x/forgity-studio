import React, { useState, useEffect, useCallback } from "react";
import {
  Folder,
  FileCode,
  ChevronRight,
  RefreshCw,
  Plus,
  Trash2,
  Check,
  Tag,
  Key,
  FolderOpen,
  Gamepad2,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { openNativeFileOrFolderDialog } from "@/lib/platform/filePickerStrategy";
import type { WorkspaceConstantItem, ConstantScope, ConstantDataType } from "../../types/workspaceConfig";

export interface UnrealContentItem {
  name: string;
  relativePath: string;
  virtualPath: string;
  isDirectory: boolean;
  extension?: string;
}

export interface UnrealProjectMapping {
  projectId: string;
  uprojectPath: string;
  contentDir: string;
}

interface UnrealContentVaultWorkspaceProps {
  projectId: string;
  workspaceRoot?: string | null;
  constants: WorkspaceConstantItem[];
  onUpdateConstant: (item: WorkspaceConstantItem) => void;
  onAddConstant: (item: WorkspaceConstantItem) => void;
  onDeleteConstant: (key: string) => void;
}

export function UnrealContentVaultWorkspace({
  projectId,
  workspaceRoot,
  constants,
  onUpdateConstant,
  onAddConstant,
  onDeleteConstant,
}: UnrealContentVaultWorkspaceProps) {
  // Runner-backed Project Mapping
  const [projectMapping, setProjectMapping] = useState<UnrealProjectMapping | null>(null);
  const [isLoadingMapping, setIsLoadingMapping] = useState<boolean>(true);

  // Navigation & Browser State
  const [currentSubPath, setCurrentSubPath] = useState<string>("");
  const [items, setItems] = useState<UnrealContentItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState<boolean>(false);
  const [selectedBrowserItem, setSelectedBrowserItem] = useState<UnrealContentItem | null>(null);

  // Constants Target Selection
  const unrealConstants = constants.filter((c) => (c.scope || "General") === "Unreal");
  const [activeConstantKey, setActiveConstantKey] = useState<string>(
    unrealConstants.length > 0 ? unrealConstants[0].key : ""
  );

  // New Constant Inline Form
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<ConstantDataType>("String");

  const activeConstant = unrealConstants.find((c) => c.key === activeConstantKey) || unrealConstants[0] || null;

  // 1. Load project mapping from Workspace Registry (AppData), fallback to runner.toml
  const loadRunnerProjectMapping = useCallback(async () => {
    setIsLoadingMapping(true);
    try {
      if (workspaceRoot) {
        const wsUproject = await invoke<string | null>("get_workspace_unreal_project", {
          rootPath: workspaceRoot,
        });
        if (wsUproject) {
          const normalized = wsUproject.replace(/\\/g, "/");
          const parentDir = normalized.slice(0, Math.max(0, normalized.lastIndexOf("/")));
          setProjectMapping({
            projectId,
            uprojectPath: normalized,
            contentDir: parentDir ? `${parentDir}/Content` : "",
          });
          return;
        }
      }

      const mapping = await invoke<UnrealProjectMapping | null>("get_runner_unreal_project", {
        workspaceRoot: workspaceRoot || null,
        projectId,
      });
      setProjectMapping(mapping);
    } catch (err: any) {
      console.warn("Failed to read Unreal project mapping", err);
    } finally {
      setIsLoadingMapping(false);
    }
  }, [workspaceRoot, projectId]);

  useEffect(() => {
    loadRunnerProjectMapping();
  }, [loadRunnerProjectMapping]);

  // 2. Load Content Items via Native Rust Command
  const loadDirectoryItems = useCallback(async (dir: string, sub: string) => {
    if (!dir) {
      setItems([]);
      return;
    }
    setIsLoadingItems(true);
    try {
      const res = await invoke<UnrealContentItem[]>("list_unreal_content_items", {
        contentDir: dir,
        subPath: sub || null,
      });
      setItems(res || []);
    } catch (err: any) {
      toast.error("Failed to load Unreal Content directory", { description: err?.message || String(err) });
      setItems([]);
    } finally {
      setIsLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    if (projectMapping?.contentDir) {
      loadDirectoryItems(projectMapping.contentDir, currentSubPath);
    } else {
      setItems([]);
    }
  }, [projectMapping?.contentDir, currentSubPath, loadDirectoryItems]);

  // 3. Pick Native .uproject file and save to runner.toml
  const handlePickUproject = async () => {
    try {
      const selected = await openNativeFileOrFolderDialog({
        mode: "file",
        title: "Select Unreal Project (.uproject)",
        extensions: ["uproject"],
      });
      if (selected) {
        if (workspaceRoot) {
          const savedPath = await invoke<string | null>("set_workspace_unreal_project", {
            rootPath: workspaceRoot,
            uprojectPath: selected,
          });
          const normalized = (savedPath || selected).replace(/\\/g, "/");
          const parentDir = normalized.slice(0, Math.max(0, normalized.lastIndexOf("/")));
          setProjectMapping({
            projectId,
            uprojectPath: normalized,
            contentDir: parentDir ? `${parentDir}/Content` : "",
          });
        } else {
          const saved = await invoke<UnrealProjectMapping>("set_runner_unreal_project", {
            workspaceRoot: null,
            projectId,
            uprojectPath: selected,
          });
          setProjectMapping(saved);
        }
        setCurrentSubPath("");
        toast.success("Unreal project linked to workspace!", {
          description: selected,
        });
      }
    } catch (err: any) {
      toast.error("Failed to select .uproject", { description: err?.message });
    }
  };

  // Breadcrumbs navigation
  const pathParts = currentSubPath.split(/[\/\\]/).filter(Boolean);
  const handleNavigateToBreadcrumb = (index: number) => {
    if (index === -1) {
      setCurrentSubPath("");
    } else {
      const newSub = pathParts.slice(0, index + 1).join("/");
      setCurrentSubPath(newSub);
    }
    setSelectedBrowserItem(null);
  };

  const handleOpenFolder = (item: UnrealContentItem) => {
    if (item.isDirectory) {
      setCurrentSubPath(item.relativePath);
      setSelectedBrowserItem(null);
    }
  };

  // Assign or Append into Active Constant
  const handleApplyToActiveConstant = (virtPath: string) => {
    if (!activeConstant) {
      toast.error("Please select or create an Unreal Constant first!");
      return;
    }

    if (activeConstant.dataType === "Array") {
      const currentList: string[] = Array.isArray(activeConstant.value)
        ? [...activeConstant.value]
        : activeConstant.value
        ? [String(activeConstant.value)]
        : [];

      if (currentList.includes(virtPath)) {
        toast.info("Path already in constant list");
        return;
      }
      const updatedList = [...currentList, virtPath];
      const currentUnrealList: string[] = Array.isArray(activeConstant.unrealPath)
        ? [...activeConstant.unrealPath]
        : [...currentList];
      const updatedUnrealList =
        currentUnrealList.length === currentList.length
          ? [...currentUnrealList, virtPath]
          : updatedList;
      onUpdateConstant({
        ...activeConstant,
        value: updatedList,
        unrealPath: updatedUnrealList,
      });
      toast.success(`Added '${virtPath}' to list '${activeConstant.key}'`);
    } else {
      onUpdateConstant({
        ...activeConstant,
        value: virtPath,
        unrealPath: virtPath,
      });
      toast.success(`Assigned '${virtPath}' to '${activeConstant.key}'`);
    }
  };

  // Remove Tag from Array Constant
  const handleRemoveTag = (tagToRemove: string) => {
    if (!activeConstant || !Array.isArray(activeConstant.value)) return;
    const removeIdx = activeConstant.value.indexOf(tagToRemove);
    const updatedList = activeConstant.value.filter((_: string, idx: number) => idx !== removeIdx);
    const updatedUnrealList = Array.isArray(activeConstant.unrealPath)
      ? activeConstant.unrealPath.filter((_: string, idx: number) => idx !== removeIdx)
      : updatedList;
    onUpdateConstant({
      ...activeConstant,
      value: updatedList,
      unrealPath: updatedUnrealList,
    });
    toast.info(`Removed tag from '${activeConstant.key}'`);
  };

  // Create New Unreal Constant inline
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = newKey.trim().toUpperCase();
    if (!cleanKey) return;

    if (constants.some((c) => c.key.toUpperCase() === cleanKey)) {
      toast.error(`Constant '${cleanKey}' already exists!`);
      return;
    }

    const newItem: WorkspaceConstantItem = {
      key: cleanKey,
      scope: "Unreal" as ConstantScope,
      dataType: newType,
      value: newType === "Array" ? [] : "",
      unrealPath: newType === "Array" ? [] : "",
    };

    onAddConstant(newItem);
    setActiveConstantKey(cleanKey);
    setNewKey("");
    setIsCreatingNew(false);
    toast.success(`Created Unreal Constant '${cleanKey}'`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Top Project Mapping Status Banner */}
      <div className="px-4 py-2 border-b border-border/80 bg-card/60 flex items-center justify-between shrink-0 text-xs">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Gamepad2 className="h-4 w-4 text-indigo-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">Linked Project:</span>
              {projectMapping ? (
                <code className="font-mono text-indigo-400 truncate max-w-[500px]">
                  {projectMapping.uprojectPath}
                </code>
              ) : (
                <span className="text-amber-500 italic">No .uproject linked in runner config</span>
              )}
            </div>
            {projectMapping && (
              <div className="text-[10px] text-muted-foreground font-mono truncate">
                Content Root: {projectMapping.contentDir} (stored in runner.toml)
              </div>
            )}
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onPress={handlePickUproject}
          className="h-7 px-2.5 text-xs gap-1.5 cursor-pointer shrink-0 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
        >
          <Folder className="h-3.5 w-3.5 text-amber-500" />
          <span>{projectMapping ? "Change .uproject" : "Select .uproject"}</span>
        </Button>
      </div>

      {/* Main 2-Column Grid */}
      <div className="flex-1 grid grid-cols-12 min-h-0 divide-x divide-border/60 overflow-hidden">
        {/* ========================================================================= */}
        {/* Left Column: Unreal Content Browser (Root: /Game/...)                    */}
        {/* ========================================================================= */}
        <div className="col-span-7 flex flex-col h-full overflow-hidden">
          {/* Content Browser Header & Breadcrumbs in ONE single aligned bar */}
          <div className="px-4 py-2 border-b border-border/60 bg-card/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <FolderOpen className="h-4 w-4 text-indigo-400 shrink-0" />
              <div className="flex items-center gap-1 text-xs font-mono overflow-x-auto custom-scrollbar min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => handleNavigateToBreadcrumb(-1)}
                  className={`px-1 py-0.5 rounded cursor-pointer transition-colors shrink-0 ${
                    pathParts.length === 0
                      ? "text-indigo-400 font-semibold bg-indigo-500/15"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  /Game
                </button>
                {pathParts.map((part, idx) => (
                  <React.Fragment key={idx}>
                    <ChevronRight className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    <button
                      type="button"
                      onClick={() => handleNavigateToBreadcrumb(idx)}
                      className={`px-1 py-0.5 rounded cursor-pointer transition-colors truncate max-w-[150px] shrink-0 ${
                        idx === pathParts.length - 1
                          ? "text-indigo-400 font-semibold bg-indigo-500/15"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {part}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onPress={() => projectMapping?.contentDir && loadDirectoryItems(projectMapping.contentDir, currentSubPath)}
              isDisabled={isLoadingItems || !projectMapping}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer shrink-0 ml-2"
              aria-label="Refresh Directory"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoadingItems ? "animate-spin text-indigo-400" : ""}`} />
            </Button>
          </div>

          {/* Content Items List (Flat full-bleed, divide-y, icon vertical alignment on X=16px) */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/20 bg-background">
            {isLoadingMapping ? (
              <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                <span>Reading runner project mapping...</span>
              </div>
            ) : !projectMapping ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <Gamepad2 className="h-8 w-8 mx-auto mb-2 opacity-40 text-indigo-400" />
                <p className="font-medium text-foreground">No Unreal Project Linked</p>
                <p className="mt-1">
                  Click &quot;Select .uproject&quot; above to link your game project. This will be saved in your runner configuration.
                </p>
              </div>
            ) : isLoadingItems ? (
              <div className="p-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin text-indigo-400" />
                <span>Scanning Content directory...</span>
              </div>
            ) : items.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-30 text-indigo-400" />
                <p className="font-medium text-foreground">Empty Directory</p>
                <p className="mt-1">Folder is empty or has no assets.</p>
              </div>
            ) : (
              items.map((item) => {
                const isSelected = selectedBrowserItem?.virtualPath === item.virtualPath;
                return (
                  <div
                    key={item.virtualPath}
                    onClick={() => setSelectedBrowserItem(item)}
                    onDoubleClick={() => {
                      if (item.isDirectory) {
                        handleOpenFolder(item);
                      } else {
                        handleApplyToActiveConstant(item.virtualPath);
                      }
                    }}
                    className={`flex items-center justify-between px-4 py-2 cursor-pointer text-xs transition-colors select-none ${
                      isSelected
                        ? "bg-indigo-500/15 text-foreground"
                        : "hover:bg-muted/30 text-foreground/90"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {item.isDirectory ? (
                        <Folder className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : (
                        <FileCode className="h-4 w-4 text-emerald-400 shrink-0" />
                      )}
                      <span className="font-medium truncate">{item.name}</span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className="font-mono text-[11px] text-muted-foreground/70 hidden sm:inline truncate max-w-[220px]">
                        {item.virtualPath}
                      </span>

                      {item.isDirectory ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onPress={() => handleOpenFolder(item)}
                          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          Open
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onPress={() => handleApplyToActiveConstant(item.virtualPath)}
                          className="h-6 px-2 text-[10px] gap-1 cursor-pointer border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
                        >
                          {activeConstant?.dataType === "Array" ? "Add to List" : "Assign"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Status / Selection Bar */}
          {selectedBrowserItem && (
            <div className="px-4 py-2 border-t border-border/60 bg-muted/20 flex items-center justify-between shrink-0 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-muted-foreground">Selected:</span>
                <code className="font-mono text-indigo-400 truncate">{selectedBrowserItem.virtualPath}</code>
              </div>
              <Button
                size="sm"
                onPress={() => handleApplyToActiveConstant(selectedBrowserItem.virtualPath)}
                className="h-7 text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1 cursor-pointer"
              >
                <Check className="h-3 w-3" />
                <span>{activeConstant?.dataType === "Array" ? "Add to Constant List" : "Assign to Constant"}</span>
              </Button>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* Right Column: Unreal Constants Selector & Tag/Value Manager              */}
        {/* ========================================================================= */}
        <div className="col-span-5 flex flex-col h-full overflow-hidden bg-card/20">
          {/* Right Header */}
          <div className="px-4 py-2 border-b border-border/60 bg-card/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-semibold text-foreground">Unreal Constants</span>
            </div>

            <Button
              size="sm"
              variant="outline"
              onPress={() => setIsCreatingNew(!isCreatingNew)}
              className="h-7 px-2.5 text-xs gap-1 cursor-pointer border-border/80 hover:bg-muted/40"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Constant</span>
            </Button>
          </div>

          {/* Inline Create Form */}
          {isCreatingNew && (
            <form onSubmit={handleCreateSubmit} className="px-4 py-2.5 border-b border-border/60 bg-muted/20 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value.toUpperCase())}
                  placeholder="UNREAL_VAR_KEY..."
                  className="h-8 text-xs font-mono uppercase bg-background flex-1"
                />
                <div className="w-[120px]">
                  <Select
                    selectedKey={newType}
                    onSelectionChange={(k) => setNewType(String(k) as ConstantDataType)}
                    className="w-full"
                  >
                    <SelectTrigger className="h-8 px-2 text-xs bg-background border-border/80 text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent placement="bottom end" className="w-[140px] bg-popover/95 backdrop-blur-md border border-border/80 shadow-xl p-1 rounded-lg">
                      <SelectItem id="String" textValue="String" className="px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted/60">
                        String
                      </SelectItem>
                      <SelectItem id="Array" textValue="List (Array)" className="px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted/60">
                        List (Array)
                      </SelectItem>
                      <SelectItem id="Path" textValue="Path" className="px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted/60">
                        Path
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onPress={() => setIsCreatingNew(false)}
                  className="h-6 px-2 text-[11px]"
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" className="h-6 px-2.5 text-[11px] bg-primary text-primary-foreground">
                  Create
                </Button>
              </div>
            </form>
          )}

          {/* Active Constant Selector Bar */}
          <div className="px-4 py-2 border-b border-border/40 flex items-center gap-2.5 shrink-0">
            <span className="text-xs text-muted-foreground shrink-0 font-medium">Target:</span>
            {unrealConstants.length === 0 ? (
              <span className="text-xs text-muted-foreground italic">No Unreal constants configured</span>
            ) : (
              <Select
                selectedKey={activeConstant?.key || null}
                onSelectionChange={(key) => setActiveConstantKey(String(key))}
                className="flex-1 min-w-0"
              >
                <SelectTrigger className="h-8 px-3 bg-background border-border/80 text-foreground font-mono text-xs font-semibold hover:border-indigo-500/60 transition-colors">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent placement="bottom start" className="w-[320px] bg-popover/95 backdrop-blur-md border border-border/80 shadow-2xl p-1 rounded-lg">
                  {unrealConstants.map((c) => (
                    <SelectItem
                      key={c.key}
                      id={c.key}
                      textValue={`$${c.key}`}
                      className="px-2.5 py-1.5 rounded-md text-xs font-mono flex items-center justify-between cursor-pointer hover:bg-indigo-500/15 data-focused:bg-indigo-500/15 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Key className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                        <span className="font-semibold text-foreground truncate">${c.key}</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 h-4 shrink-0 font-sans ${
                          c.dataType === "Array"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                        }`}
                      >
                        {c.dataType === "Array" ? "List" : "String"}
                      </Badge>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Active Constant Detail & Tag Manager */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {activeConstant ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold font-mono text-foreground flex items-center gap-2">
                      <span>${activeConstant.key}</span>
                      <Badge variant="outline" className="text-[10px] font-sans">
                        {activeConstant.dataType === "Array" ? "List (Array)" : "String"}
                      </Badge>
                    </h3>
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onPress={() => onDeleteConstant(activeConstant.key)}
                    className="size-7 text-muted-foreground hover:text-destructive cursor-pointer"
                    aria-label="Delete Constant"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Tag / Value Area */}
                {activeConstant.dataType === "Array" ? (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5" />
                      <span>Configured Paths (
                        {Array.isArray(activeConstant.value) ? activeConstant.value.length : 0}
                      )</span>
                    </span>

                    <div className="space-y-1.5 min-h-[120px] p-2.5 rounded-lg border border-border/60 bg-background/50">
                      {Array.isArray(activeConstant.value) && activeConstant.value.length > 0 ? (
                        activeConstant.value.map((tagPath: string) => (
                          <div
                            key={tagPath}
                            className="flex items-center justify-between p-1.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 text-xs font-mono"
                          >
                            <span className="truncate flex-1">{tagPath}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(tagPath)}
                              className="p-1 hover:text-destructive text-muted-foreground transition-colors ml-1 cursor-pointer"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground italic text-center py-6">
                          No paths added yet. Select folders/files on the left and click &quot;Add to List&quot;.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-muted-foreground">Assigned Virtual Path:</span>
                    <div className="p-3 rounded-lg border border-border/60 bg-background/50">
                      <Input
                        value={String(activeConstant.value || "")}
                        onChange={(e) =>
                          onUpdateConstant({
                            ...activeConstant,
                            value: e.target.value,
                            unrealPath: e.target.value,
                          })
                        }
                        placeholder="/Game/Characters/Genesis9"
                        className="font-mono text-xs text-indigo-300 bg-background border-indigo-500/30"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Double-click an item in the Content Browser or edit directly.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Click &quot;+ New Constant&quot; above to create an Unreal Constant.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
