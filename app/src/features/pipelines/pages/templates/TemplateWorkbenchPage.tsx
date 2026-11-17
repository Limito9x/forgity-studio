import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, KeyRound, Play, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetMyLibraryItem } from "@/gen/endpoints/templates/templates";
import { useDispatchCloudBundle } from "@/gen/endpoints/pipelines/pipelines";
import { PipelineCanvas } from "../../components/canvas/PipelineCanvas";
import { RunPipelineModal } from "../../dialogs/RunPipelineModal";
import { ConstantProfileEditorDrawer } from "../../components/templates/ConstantProfileEditorDrawer";
import {
  extractConstantFields,
  templateRootToPipelineGraphDto,
} from "../../adapters/templateGraphAdapter";
import { isTauriRuntime } from "@/lib/platform/filePickerStrategy";

interface TemplateWorkbenchPageProps {
  libraryItemId: string;
  machineKey?: string;
}

export function TemplateWorkbenchPage({
  libraryItemId,
  machineKey = "local-workstation",
}: TemplateWorkbenchPageProps) {
  const navigate = useNavigate();
  const { data: item, isLoading, refetch } = useGetMyLibraryItem(libraryItemId);
  const dispatchBundle = useDispatchCloudBundle();

  const [isConstantDrawerOpen, setIsConstantDrawerOpen] = useState(false);
  const [isRunModalOpen, setIsRunModalOpen] = useState(false);

  const graph = useMemo(() => {
    if (!item) return null;
    return templateRootToPipelineGraphDto(
      item.id,
      item.title,
      item.rootPipelineJson,
      item.contractsJson
    );
  }, [item]);

  const constantFields = useMemo(
    () => (item ? extractConstantFields(item.contractsJson) : []),
    [item]
  );

  const isExhausted =
    item?.maxRuns != null && (item.remainingRuns ?? 0) <= 0;

  const handleRunTemplate = async (runtimeInputs: Record<string, any>) => {
    if (!item) return;
    if (!isTauriRuntime()) {
      toast.error("Template execution requires Forgity Studio Desktop (Tauri Runtime).");
      return;
    }

    const bundle = await dispatchBundle.mutateAsync({
      data: {
        libraryItemId: item.id,
        templatePackageId: item.templatePackageId,
        projectViewId: null,
        targetPipelineVersionId: item.primaryMasterVersionId ?? null,
        constantProfileId: item.constantProfileId ?? null,
        machineKey,
        runtimeInputs,
      },
    });

    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("run_cloud_bundle", {
      bundleJson: JSON.stringify(bundle),
      runId: (bundle as any)?.runId || null,
    });

    await refetch();
    toast.success("Template execution dispatched to local runner.");
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Loading template workbench...
      </div>
    );
  }

  if (!item || !graph) {
    return (
      <div className="page-container space-y-4">
        <Button variant="ghost" onPress={() => navigate({ to: "/templates/library" as any })}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to My Library
        </Button>
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          Library item not found.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* Top Workbench Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => navigate({ to: "/templates/library" as any })}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            My Library
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold">{item.title}</h1>
              <Badge variant="secondary">{item.category}</Badge>
              <Badge variant={isExhausted ? "destructive" : "outline"}>
                {item.maxRuns != null
                  ? `${item.remainingRuns ?? 0} / ${item.maxRuns} runs left`
                  : "Unlimited"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onPress={() => setIsConstantDrawerOpen(true)}
          >
            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
            {item.constantProfileName ? (
              <span>Constants: {item.constantProfileName}</span>
            ) : (
              <span className="flex items-center gap-1 text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                Configure Constants
              </span>
            )}
          </Button>

          <Button
            size="sm"
            isDisabled={isExhausted}
            onPress={() => setIsRunModalOpen(true)}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            Run Template
          </Button>
        </div>
      </div>

      {/* Read-Only Canvas with Live Execution Tracking */}
      <div className="flex-1 overflow-hidden">
        <PipelineCanvas
          projectId="cloud-template"
          graph={graph}
          paletteItems={(item.contractsJson as any)?.nodes || []}
          readOnly
          onRequestRun={() => setIsRunModalOpen(true)}
        />
      </div>

      <ConstantProfileEditorDrawer
        open={isConstantDrawerOpen}
        onOpenChange={setIsConstantDrawerOpen}
        libraryItemId={item.id}
        currentProfileId={item.constantProfileId}
        constantFields={constantFields}
        onSaved={() => refetch()}
      />

      <RunPipelineModal
        pipelineId={item.id}
        pipelineName={item.title}
        projectId="cloud-template"
        nodes={[]}
        edges={[]}
        parameters={graph.parameters || []}
        isOpen={isRunModalOpen}
        onClose={() => setIsRunModalOpen(false)}
        isLocalMode={true}
        onRunLocal={handleRunTemplate}
      />
    </div>
  );
}
