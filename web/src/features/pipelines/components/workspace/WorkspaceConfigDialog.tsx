import { useState, useEffect } from "react";
import { Folder, HardDrive, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLocalWorkspaceStore } from "../../stores/useLocalWorkspaceStore";

interface WorkspaceConfigDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function WorkspaceConfigDialog({
  isOpen,
  onClose,
}: WorkspaceConfigDialogProps) {
  const {
    rootPath,
    config,
    updateWorkspaceConfig,
    clearLocalPalette,
  } = useLocalWorkspaceStore();

  const [scriptsDir, setScriptsDir] = useState("");
  const [pipelinesDir, setPipelinesDir] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (config) {
      setScriptsDir(config.scriptsDir || "pipeline-scripts");
      setPipelinesDir(config.pipelinesDir || "pipelines");
    }
  }, [config]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await updateWorkspaceConfig(scriptsDir.trim() || "pipeline-scripts", pipelinesDir.trim() || "pipelines");
      toast.success("Workspace configuration updated on disk!");
      onClose();
    } catch (err: any) {
      toast.error("Failed to save workspace configuration", { description: err?.message });
    } finally {
      setIsSaving(false);
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

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open: boolean) => !open && onClose()} className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
          <HardDrive className="h-4 w-4 text-emerald-500" />
          Workspace Settings
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground">
            Root Workspace Folder
          </label>
          <div className="p-2 rounded-md bg-muted/30 border border-border/60 text-xs font-mono text-muted-foreground truncate">
            {rootPath || "No root folder opened"}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            Scripts Subdirectory
          </label>
          <Input
            value={scriptsDir}
            onChange={(e) => setScriptsDir(e.target.value)}
            placeholder="e.g. pipeline-scripts"
            className="text-xs h-8 font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Folder className="h-3.5 w-3.5 text-muted-foreground" />
            Pipelines Subdirectory
          </label>
          <Input
            value={pipelinesDir}
            onChange={(e) => setPipelinesDir(e.target.value)}
            placeholder="e.g. pipelines"
            className="text-xs h-8 font-mono"
          />
        </div>

        <div className="pt-2 border-t border-border/60 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-foreground">Local Palette Cache</p>
            <p className="text-[11px] text-muted-foreground">Clear cached AST nodes in .forgity/local_palette.json</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={handleClearPalette}
            className="h-8 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 gap-1.5"
          >
            <Trash2 className="h-3 w-3" />
            Purge Cache
          </Button>
        </div>
      </div>

      <DialogFooter className="flex items-center justify-end gap-2 pt-3 border-t">
        <Button type="button" variant="outline" size="sm" onPress={onClose} className="h-8 text-xs">
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onPress={handleSave}
          isDisabled={isSaving}
          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          Save Configuration
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
