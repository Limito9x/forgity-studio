import { useState } from "react";
import { FolderOpen, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openNativeFileOrFolderDialog, isTauriRuntime } from "@/lib/platform/filePickerStrategy";

interface LocalWorkspaceEmptyStateProps {
  onOpenWorkspaceRoot: (path: string) => Promise<any>;
}

export function LocalWorkspaceEmptyState({ onOpenWorkspaceRoot }: LocalWorkspaceEmptyStateProps) {
  const [isPicking, setIsPicking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isDesktop = isTauriRuntime();

  const handlePickRootFolder = async () => {
    if (!isDesktop) {
      setErrorMsg("Local Workspace folder scanning requires Forgity Desktop (Tauri). Please use the desktop app.");
      return;
    }

    try {
      setIsPicking(true);
      setErrorMsg(null);
      const selectedPath = await openNativeFileOrFolderDialog({
        mode: "folder",
        title: "Open Workspace Root Folder",
      });

      if (!selectedPath) {
        setIsPicking(false);
        return;
      }

      await onOpenWorkspaceRoot(selectedPath);
    } catch (err: any) {
      console.error("[LocalWorkspaceEmptyState] Failed to open workspace root:", err);
      setErrorMsg(err?.message || "Failed to open workspace root folder");
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[460px] max-w-xl mx-auto text-center px-4 py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 shadow-sm mb-5">
        <FolderOpen className="h-8 w-8" />
      </div>

      <h2 className="text-xl font-bold tracking-tight text-foreground">
        Open Workspace Root Folder
      </h2>
      <p className="text-xs text-muted-foreground mt-2 max-w-md leading-relaxed">
        Select your project root folder (e.g. repository root). Forgity will automatically discover your Python scripts and pipelines from disk.
      </p>

      {errorMsg && (
        <div className="flex items-center gap-2 mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs text-left max-w-md">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="mt-6">
        <Button
          size="lg"
          onPress={handlePickRootFolder}
          isDisabled={isPicking}
          className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-10 px-6 text-xs font-semibold"
        >
          {isPicking ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          Open Workspace Folder
        </Button>
      </div>
    </div>
  );
}
