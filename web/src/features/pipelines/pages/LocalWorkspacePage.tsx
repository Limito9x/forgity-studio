import { Laptop, HardDrive, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalWorkspaceStore } from "../stores/useLocalWorkspaceStore";

interface LocalWorkspacePageProps {
  projectId: string;
}

export function LocalWorkspacePage({ projectId }: LocalWorkspacePageProps) {
  const { config, isScanning, localDraftNodes } = useLocalWorkspaceStore();
  const scriptFolders = config?.scriptFolders ?? [];

  return (
    <div className="page-container space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Laptop className="h-6 w-6 text-emerald-500" />
            Local Workspace
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Develop local Python tools and test draft pipelines with zero database pollution.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${isScanning ? "animate-spin" : ""}`} />
            Sync Scripts
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-dashed border-border/80 p-8 text-center bg-card/40">
        <HardDrive className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-60" />
        <h3 className="text-base font-semibold text-foreground">
          {scriptFolders.length > 0
            ? `${scriptFolders.length} Watched Folders Active (${localDraftNodes.length} Draft Nodes In Palette)`
            : "No Watched Folders Configured Yet"}
        </h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1">
          {scriptFolders.length > 0
            ? "Your local scripts are scanned and ready to be used in draft pipelines."
            : "Connect your local Python script folders to begin authoring pipelines directly on disk."}
        </p>
      </div>
    </div>
  );
}
