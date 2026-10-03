import { useEffect, useState } from "react";
import { Form, FormGrid, zodResolver, useForm } from "@/components/form";
import { FormInput, FormSelect } from "@/components/form-controls";
import { useRunners } from "@/features/runners/hooks/useRunners";
import { FolderBrowser } from "@/components/custom-ui/file-tree/FolderBrowser";
import {
  attachRunnerSchema,
  type AttachRunnerInput,
  type AttachRunnerOutput,
} from "../schemas/repositorySchema";
import { HardDrive, FolderSearch, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowBrowser((prev) => !prev)}
                className="h-6 px-2 text-[11px] gap-1 text-primary hover:text-primary/80 cursor-pointer"
              >
                <FolderSearch className="size-3" />
                <span>{showBrowser ? "Hide Browser" : "Browse Remote Folders"}</span>
              </Button>
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

      {/* Remote Folder Browser Section */}
      {selectedRunnerId ? (
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
