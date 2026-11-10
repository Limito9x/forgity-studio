import { useState } from "react";
import { Laptop, FolderPlus, Sparkles, FolderGit2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openNativeFileOrFolderDialog, isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import { useLocalWorkspaceStore } from "../../stores/useLocalWorkspaceStore";

export function LocalWorkspaceEmptyState() {
  const { addScriptFolder, scanAndSyncScripts } = useLocalWorkspaceStore();
  const [isPicking, setIsPicking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isDesktop = isTauriRuntime();

  const handlePickFolder = async () => {
    if (!isDesktop) {
      setErrorMsg("Local Workspace folder scanning requires Forgity Desktop (Tauri). Please use the desktop app.");
      return;
    }

    try {
      setIsPicking(true);
      setErrorMsg(null);
      const selectedPath = await openNativeFileOrFolderDialog({
        mode: "folder",
        title: "Select Local Script Folder",
      });

      if (!selectedPath) {
        setIsPicking(false);
        return;
      }

      // Infer clean namespace from folder name
      const parts = selectedPath.split(/[/\\\\]/);
      const folderName = parts[parts.length - 1] || "custom";
      const cleanNamespace = folderName.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "custom";

      await addScriptFolder({
        namespace: cleanNamespace,
        path: selectedPath,
        enabled: true,
      });

      await scanAndSyncScripts();
    } catch (err: any) {
      console.error("[LocalWorkspaceEmptyState] Failed to add script folder:", err);
      setErrorMsg(err?.message || "Failed to add script folder");
    } finally {
      setIsPicking(false);
    }
  };

  const handleSetupDefaultCore = async () => {
    try {
      setIsPicking(true);
      setErrorMsg(null);
      await addScriptFolder({
        namespace: "core",
        path: "pipeline-scripts",
        enabled: true,
      });
      await scanAndSyncScripts();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to setup workspace");
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[520px] max-w-2xl mx-auto text-center px-4 py-12">
      <div className="relative mb-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-sm">
          <Laptop className="h-10 w-10" />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-background border border-border text-foreground shadow">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        </div>
      </div>

      <h2 className="text-2xl font-bold tracking-tight text-foreground">
        Set Up Your Local Workspace
      </h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-lg leading-relaxed">
        Connect your local Python tools directly from disk. Author, test, and iterate on pipeline
        DAGs in-memory with sub-second feedback and zero database pollution.
      </p>

      {errorMsg && (
        <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs text-left max-w-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-center gap-3 mt-8">
        <Button
          size="lg"
          onPress={handlePickFolder}
          isDisabled={isPicking}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        >
          {isPicking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderPlus className="h-4 w-4" />
          )}
          Select Watched Folder
        </Button>

        <Button
          variant="outline"
          size="lg"
          onPress={handleSetupDefaultCore}
          isDisabled={isPicking}
          className="gap-2"
        >
          <FolderGit2 className="h-4 w-4 text-muted-foreground" />
          Use Default Repository Scripts
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 text-left border-t border-border/60 pt-8 w-full">
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Zero-DB Footprint</p>
          <p className="text-[11px] text-muted-foreground">
            Scripts and drafts execute in-memory with 2-hour TTL cache. No orphaned database records.
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Direct Disk S3 Bypass</p>
          <p className="text-[11px] text-muted-foreground">
            Local scripts execute straight from your drive. Eliminates unnecessary S3 uploads.
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-foreground">Declarative YAML & CLI</p>
          <p className="text-[11px] text-muted-foreground">
            Version control with Git, run via headless CLI, and compose with AI agents via MCP.
          </p>
        </div>
      </div>
    </div>
  );
}

