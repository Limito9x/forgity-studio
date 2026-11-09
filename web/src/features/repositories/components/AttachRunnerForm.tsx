import { useEffect, useState } from "react";
import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput, FormSelect } from "@/components/form-controls";
import { useRunners } from "@/features/runners/hooks/useRunners";
import { FolderBrowser } from "@/components/custom-ui/file-tree/FolderBrowser";
import { useFilePickerStrategy } from "@/lib/platform/filePickerStrategy";
import {
  attachRunnerSchema,
  type AttachRunnerInput,
  type AttachRunnerOutput,
} from "../schemas/repositorySchema";
import { HardDrive, FolderSearch, FolderOpen, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface AttachRunnerFormProps {
  formId?: string;
  onSubmit: (values: AttachRunnerOutput) => void;
  defaultValues?: Partial<AttachRunnerInput>;
}

export function AttachRunnerForm({
  formId = "attach-runner-form",
  onSubmit,
  defaultValues,
}: AttachRunnerFormProps) {
  const { data: runners = [], isLoading: isLoadingRunners } = useRunners();
  const [showBrowser, setShowBrowser] = useState(true);

  const form = useForm<AttachRunnerInput, any, AttachRunnerOutput>({
    resolver: zodResolver(attachRunnerSchema),
    defaultValues: {
      runnerId: defaultValues?.runnerId || "",
      rootPath: defaultValues?.rootPath || "",
    },
  });

  const selectedRunnerId = form.watch("runnerId");
  const currentRootPath = form.watch("rootPath");

  const selectedRunner = runners.find((r) => r.id === selectedRunnerId);
  const { isLocal, pickNative } = useFilePickerStrategy(selectedRunner);

  // Auto-select first runner if none selected and runners available
  useEffect(() => {
    if (!form.getValues("runnerId") && runners.length > 0) {
      const activeRunner = runners.find((r) => r.isActive) || runners[0];
      if (activeRunner) {
        form.setValue("runnerId", activeRunner.id);
      }
    }
  }, [runners, form]);

  const runnerOptions = runners.map((r) => ({
    value: r.id,
    label: `${r.name || r.machineKey} (${r.machineKey})${r.isActive ? " • Online" : " • Offline"}`,
  }));

  return (
    <Form form={form} formId={formId} onSubmit={onSubmit} className="w-full space-y-3.5">
      <FormGrid cols={1} className="gap-3 w-full">
        <FormSelect
          control={form.control}
          label="Select Runner"
          name="runnerId"
          placeholder={isLoadingRunners && runners.length === 0 ? "Loading runners..." : "Choose a compute runner machine..."}
          options={runnerOptions}
          isDisabled={isLoadingRunners && runners.length === 0}
          isRequired
        />

        <div className="space-y-1 w-full">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground flex items-center gap-1">
              <span>Root Directory Path</span>
              <span className="text-destructive">*</span>
            </span>
            {selectedRunnerId && (
              <div className="flex items-center gap-1.5">
                {isLocal ? (
                  /* 1-Click Native Folder Picker: Zero friction on Desktop for local workstation */
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const picked = await pickNative({
                          mode: "folder",
                          title: "Select Repository Root Folder",
                          defaultPath: currentRootPath || undefined,
                        });
                        if (picked) {
                          form.setValue("rootPath", picked, { shouldValidate: true, shouldDirty: true });
                          toast.success("Selected local repository folder");
                        }
                      } catch (err: any) {
                        toast.error(err?.message || "Failed to open folder picker");
                      }
                    }}
                    className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary/80 font-medium cursor-pointer"
                  >
                    <FolderOpen className="size-3" />
                    <span>Browse Folder...</span>
                  </Button>
                ) : (
                  /* Remote Runner: Toggle Remote Tree Browser */
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBrowser((prev) => !prev)}
                    className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <FolderSearch className="size-3" />
                    <span>{showBrowser ? "Hide Remote Tree" : "Remote Folder Tree"}</span>
                  </Button>
                )}
              </div>
            )}
          </div>

          <FormInput
            control={form.control}
            name="rootPath"
            type="text"
            placeholder="e.g. D:/Daz3D/MyLibrary or E:/BlenderAssets"
            isRequired
          />
        </div>
      </FormGrid>

      {/* Remote Folder Browser Section (Only needed when browsing a remote runner) */}
      {selectedRunnerId && !isLocal ? (
        showBrowser ? (
          <div className="space-y-1.5 pt-0.5 w-full">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground px-0.5">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <HardDrive className="size-3 text-primary" /> Browse Runner Drives & Folders
              </span>
              <span>Click a folder or drive to select as root path</span>
            </div>
            <FolderBrowser
              runnerId={selectedRunnerId}
              initialPath={currentRootPath}
              selectedPath={currentRootPath}
              onSelectPath={(path) => {
                form.setValue("rootPath", path, { shouldValidate: true, shouldDirty: true });
              }}
              mode="folder"
              className="w-full"
              height={260}
            />
          </div>
        ) : null
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 p-4 text-center text-xs text-muted-foreground bg-muted/20 flex items-center justify-center gap-2">
          <Info className="size-4 text-muted-foreground/70 shrink-0" />
          <span>Select a runner above to browse its local drives and directories.</span>
        </div>
      )}
    </Form>
  );
}
