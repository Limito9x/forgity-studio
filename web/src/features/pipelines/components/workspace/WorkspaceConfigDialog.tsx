import { useState, useEffect } from "react";
import { Folder, FolderPlus, RefreshCw, Trash2, CheckCircle2, FileCode, HardDrive } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import { useLocalWorkspaceStore } from "../../stores/useLocalWorkspaceStore";

interface WorkspaceConfigDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function WorkspaceConfigDialog({
  projectId,
  isOpen,
  onClose,
}: WorkspaceConfigDialogProps) {
  const {
    config,
    scanSummary,
    isScanning,
    initWorkspace,
    addScriptFolder,
    removeScriptFolder,
    toggleScriptFolder,
    setPrimaryPipelineFolder,
    scanAndSyncScripts,
  } = useLocalWorkspaceStore();

  const [newNamespace, setNewNamespace] = useState("");
  const [newFolderPath, setNewFolderPath] = useState("");
  const [pipelineFolder, setPipelineFolder] = useState("");
  const isDesktop = isTauriRuntime();

  useEffect(() => {
    // Only init if config is missing to avoid triggering full page isLoading spinner
    if (isOpen && projectId && !config) {
      initWorkspace(projectId);
    }
  }, [isOpen, projectId, config, initWorkspace]);

  useEffect(() => {
    if (config) {
      setPipelineFolder(config.primaryPipelineFolder || "pipelines");
    }
  }, [config]);

  const handlePickPrimaryFolder = async () => {
    if (!isDesktop) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Primary Pipeline (.pipeline.yaml) Folder",
      });
      if (typeof selected === "string" && selected.trim()) {
        const cleanPath = selected.replace(/\\/g, "/");
        setPipelineFolder(cleanPath);
        await setPrimaryPipelineFolder(cleanPath);
        toast.success(`Primary pipeline folder updated to: ${cleanPath}`);
      }
    } catch (err: any) {
      toast.error(`Folder picker failed: ${err?.message || err}`);
    }
  };

  const handlePickScriptFolder = async () => {
    if (!isDesktop) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Python Script Folder",
      });
      if (typeof selected === "string" && selected.trim()) {
        const cleanPath = selected.replace(/\\/g, "/");
        setNewFolderPath(cleanPath);
        if (!newNamespace) {
          const parts = cleanPath.split("/").filter(Boolean);
          const lastFolder = parts[parts.length - 1] || "scripts";
          setNewNamespace(lastFolder.toLowerCase().replace(/[^a-z0-9_-]/g, ""));
        }
      }
    } catch (err: any) {
      toast.error(`Folder picker failed: ${err?.message || err}`);
    }
  };

  const handleAddFolder = async () => {
    if (!newFolderPath.trim()) {
      toast.error("Please enter or pick a folder path.");
      return;
    }
    const ns = newNamespace.trim() || "scripts";
    await addScriptFolder({
      namespace: ns,
      path: newFolderPath.trim().replace(/\\/g, "/"),
      enabled: true,
    });
    setNewNamespace("");
    setNewFolderPath("");
    toast.success(`Added watched folder: ${ns}`);
  };

  const handleSavePipelineFolder = async () => {
    if (pipelineFolder.trim() && pipelineFolder !== config?.primaryPipelineFolder) {
      await setPrimaryPipelineFolder(pipelineFolder.trim());
      toast.success("Primary pipeline folder saved.");
    }
  };

  const handleScanSync = async () => {
    try {
      const res = await scanAndSyncScripts();
      if (res) {
        toast.success(
          `Sync complete: ${res.unchanged} unchanged, ${res.newCount} new, ${res.modified} modified (${res.total} total)`
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "Scan and sync failed");
    }
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open: boolean) => !open && onClose()} className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <HardDrive className="h-5 w-5 text-primary" />
          Local-First Workspace & Script Settings
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Configure local script authoring folders and primary declarative pipeline storage.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-5 py-3">
        {/* Primary Pipeline Folder */}
        <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
          <label className="text-xs font-semibold flex items-center gap-1.5">
            <Folder className="h-3.5 w-3.5 text-blue-500" />
            Primary Pipeline Folder (.pipeline.yaml)
          </label>
          <p className="text-[11px] text-muted-foreground">
            Where your local pipeline definition files will be stored and synchronized.
          </p>
          <div className="flex gap-2 items-center pt-1">
            <Input
              value={pipelineFolder}
              onChange={(e) => setPipelineFolder(e.target.value)}
              onBlur={handleSavePipelineFolder}
              placeholder="e.g. pipelines or D:/MyGame/Pipelines"
              className="text-xs h-8 font-mono"
            />
            {isDesktop && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2 text-xs"
                onPress={handlePickPrimaryFolder}
              >
                Browse...
              </Button>
            )}
          </div>
        </div>

        {/* Watched Script Folders */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-semibold flex items-center gap-1.5">
                <FileCode className="h-3.5 w-3.5 text-emerald-500" />
                Watched Script Folders (Auto-Scan)
              </label>
              <p className="text-[11px] text-muted-foreground">
                Folders scanned recursively for Python tools and Custom Script Nodes.
              </p>
            </div>
            {isDesktop && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onPress={handleScanSync}
                isDisabled={isScanning}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin text-primary" : ""}`} />
                {isScanning ? "Scanning..." : "Rescan & Sync"}
              </Button>
            )}
          </div>

          {/* Folder List */}
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {config?.scriptFolders && config.scriptFolders.length > 0 ? (
              config.scriptFolders.map((folder) => (
                <div
                  key={folder.path}
                  className="flex items-center justify-between p-2.5 rounded-md border bg-card text-card-foreground text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Switch
                      isSelected={folder.enabled}
                      onChange={(checked: boolean) => toggleScriptFolder(folder.path, checked)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground truncate">{folder.namespace}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                          Namespace
                        </Badge>
                      </div>
                      <p className="text-[11px] font-mono text-muted-foreground truncate" title={folder.path}>
                        {folder.path}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onPress={() => removeScriptFolder(folder.path)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-4 border border-dashed rounded-md text-xs text-muted-foreground">
                No script folders configured. Add one below.
              </div>
            )}
          </div>

          {/* Add Folder Inputs */}
          <div className="p-3 border rounded-lg bg-muted/10 space-y-2">
            <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
              <FolderPlus className="h-3.5 w-3.5" /> Add Script Folder
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <Input
                  value={newNamespace}
                  onChange={(e) => setNewNamespace(e.target.value)}
                  placeholder="Namespace (e.g. core)"
                  className="text-xs h-8"
                />
              </div>
              <div className="sm:col-span-2 flex gap-1.5">
                <Input
                  value={newFolderPath}
                  onChange={(e) => setNewFolderPath(e.target.value)}
                  placeholder="Relative or absolute path"
                  className="text-xs h-8 font-mono"
                />
                {isDesktop && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onPress={handlePickScriptFolder}
                  >
                    Browse...
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onPress={handleAddFolder}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Scan Summary Pills */}
        {scanSummary && (
          <div className="p-3 rounded-lg border bg-muted/20 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="font-medium text-foreground">Last Scan Result:</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {scanSummary.unchanged} Unchanged
              </Badge>
              <Badge variant="default" className="text-xs bg-emerald-600 hover:bg-emerald-600">
                {scanSummary.newCount} New
              </Badge>
              <Badge variant="default" className="text-xs bg-amber-600 hover:bg-amber-600">
                {scanSummary.modified} Modified
              </Badge>
              <span className="text-[11px] text-muted-foreground ml-1">
                ({scanSummary.total} scripts total)
              </span>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="flex items-center justify-between sm:justify-between pt-2 border-t">
        <span className="text-[11px] text-muted-foreground">
          {isDesktop ? "Running on Tauri Native Desktop" : "Web Preview Mode (Native scanning disabled)"}
        </span>
        <Button type="button" variant="outline" size="sm" onPress={onClose}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
