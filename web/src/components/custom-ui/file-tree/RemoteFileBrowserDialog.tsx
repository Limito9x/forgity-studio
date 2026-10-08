import { useState, useEffect } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import { FolderBrowser, type BrowserMode } from "./FolderBrowser";
import type { DirectoryNodeDto } from "@/gen/model";
import { Button } from "@/components/ui/button";
import { Check, FileCheck } from "lucide-react";

export interface RemoteFileBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runnerId: string;
  runnerName?: string;
  title?: string;
  description?: string;
  initialPath?: string;
  mode?: BrowserMode;
  extensions?: string[];
  onSelect: (selectedPath: string) => void;
}

export function RemoteFileBrowserDialog({
  open,
  onOpenChange,
  runnerId,
  runnerName,
  title,
  description,
  initialPath = "",
  mode = "file",
  extensions,
  onSelect,
}: RemoteFileBrowserDialogProps) {
  const [selectedPath, setSelectedPath] = useState<string>(initialPath);

  useEffect(() => {
    if (open) {
      setSelectedPath(initialPath);
    }
  }, [open, initialPath]);

  const handleConfirm = (pathToConfirm?: string) => {
    const finalPath = pathToConfirm || selectedPath;
    if (finalPath) {
      onSelect(finalPath);
      onOpenChange(false);
    }
  };

  const defaultTitle =
    mode === "file"
      ? `Select Remote File ${runnerName ? `(${runnerName})` : ""}`
      : mode === "folder"
      ? `Select Remote Folder ${runnerName ? `(${runnerName})` : ""}`
      : `Browse Remote Filesystem ${runnerName ? `(${runnerName})` : ""}`;

  const defaultDescription =
    description ||
    (mode === "file"
      ? extensions && extensions.length > 0
        ? `Browse and select a file matching [${extensions.join(", ")}] from the runner machine.`
        : "Browse and select a file from the runner machine."
      : "Browse and select a directory from the runner machine.");

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title || defaultTitle}
      description={defaultDescription}
      size="2xl"
      footer={
        <div className="flex flex-col-reverse sm:flex-row items-center justify-between w-full gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate w-full sm:max-w-[400px]">
            <span className="font-semibold text-foreground shrink-0">Target:</span>
            <span
              className="font-mono text-primary truncate max-w-full"
              title={selectedPath || "No item selected"}
            >
              {selectedPath || "No item selected"}
            </span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              isDisabled={!selectedPath}
              onClick={() => handleConfirm()}
              className="gap-1.5"
            >
              {mode === "file" ? (
                <FileCheck className="size-4" />
              ) : (
                <Check className="size-4" />
              )}
              <span>Select {mode === "file" ? "File" : "Path"}</span>
            </Button>
          </div>
        </div>
      }
    >
      <div className="py-1">
        <FolderBrowser
          runnerId={runnerId}
          initialPath={initialPath}
          selectedPath={selectedPath}
          onSelectPath={(path) => setSelectedPath(path)}
          onDoubleClickItem={(item: DirectoryNodeDto) => {
            if (mode === "file" && !item.isDirectory) {
              handleConfirm(item.path);
            }
          }}
          mode={mode}
          extensions={extensions}
          height={420}
        />
      </div>
    </BaseDialog>
  );
}
