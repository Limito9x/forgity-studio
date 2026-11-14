import { Plus, Workflow, CloudDownload, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LocalWorkspaceWelcomeStateProps {
  onCreatePipeline: () => void;
  onPullFromStudio?: () => void;
  onUnpackPackage?: () => void;
  rootPath?: string | null;
}

export function LocalWorkspaceWelcomeState({
  onCreatePipeline,
  onPullFromStudio,
  onUnpackPackage,
}: LocalWorkspaceWelcomeStateProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-8 bg-background/50">
      <div className="max-w-md w-full flex flex-col items-center text-center space-y-6">
        <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shadow-sm">
          <Workflow className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Local Pipeline Workbench
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
            Select a pipeline from the left sidebar to start editing, or create a new declarative pipeline file on your local workstation.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
          <Button
            size="sm"
            onPress={onCreatePipeline}
            className="w-full sm:w-auto h-9 px-4 gap-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          >
            <Plus className="h-4 w-4" />
            New Pipeline (.pipeline.yaml)
          </Button>

          {onPullFromStudio && (
            <Button
              size="sm"
              variant="outline"
              onPress={onPullFromStudio}
              className="w-full sm:w-auto h-9 px-4 gap-2 text-xs border-primary/40 text-primary hover:bg-primary/10 font-medium"
            >
              <CloudDownload className="h-4 w-4" />
              Pull from Studio
            </Button>
          )}

          {onUnpackPackage && (
            <Button
              size="sm"
              variant="outline"
              onPress={onUnpackPackage}
              className="w-full sm:w-auto h-9 px-4 gap-2 text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-medium"
            >
              <Package className="h-4 w-4" />
              Import Package
            </Button>
          )}
        </div>

        <div className="pt-4 border-t border-border/50 w-full text-left space-y-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
            Quick Tips:
          </span>
          <ul className="text-xs text-muted-foreground/80 space-y-1.5 list-disc list-inside">
            <li>
              Drag & Drop nodes directly from <strong className="text-foreground">Local Palette</strong> onto the canvas.
            </li>
            <li>
              Click any script to inspect its <strong className="text-foreground">Pins, Contracts & Source Code</strong>.
            </li>
            <li>
              Test pipelines instantly using <strong className="text-foreground">Run Draft</strong> with your local Runner.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
