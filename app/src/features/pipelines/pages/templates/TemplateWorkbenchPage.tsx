import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetMyLibraryItem } from "@/gen/endpoints/templates/templates";
import { PipelineCanvas } from "../../components/canvas/PipelineCanvas";
import { PipelineWorkspaceProvider } from "../../context/PipelineWorkspaceContext";
import { TemplateOutliner } from "../../components/templates/TemplateOutliner";
import { ForkTemplateDialog } from "../../dialogs/ForkTemplateDialog";
import { useCloudTemplateWorkspace } from "../../hooks/useCloudTemplateWorkspace";
import type { PipelineWorkspaceCapabilities } from "../../types/pipelineWorkspaceContract";

const WORKBENCH_CAPABILITIES: PipelineWorkspaceCapabilities = {
  canEditGraph: false,
  canSaveDraft: false,
  canSaveSnapshot: false,
  canRun: false,
};

interface TemplateWorkbenchPageProps {
  libraryItemId: string;
}

export function TemplateWorkbenchPage({
  libraryItemId,
}: TemplateWorkbenchPageProps) {
  const navigate = useNavigate();
  const { data: item, isLoading } = useGetMyLibraryItem(libraryItemId);
  const [isForkModalOpen, setIsForkModalOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    if (selectedVersionId && item.members.some((m) => m.pipelineVersionId === selectedVersionId)) {
      return;
    }
    const firstMaster = item.members.find((m) => m.role === "master");
    const initial =
      item.primaryMasterVersionId ||
      firstMaster?.pipelineVersionId ||
      item.members[0]?.pipelineVersionId ||
      null;
    setSelectedVersionId(initial);
  }, [item, selectedVersionId]);

  const {
    graph,
    workspace,
    isLoading: isGraphLoading,
    isError: isWorkspaceError,
    error: workspaceError,
  } = useCloudTemplateWorkspace({
    versionId: selectedVersionId,
    projectId: "cloud-template",
    paletteNodesJson: item?.paletteNodesJson,
    capabilities: WORKBENCH_CAPABILITIES,
  });

  const templateDetailShim = item
    ? {
        templatePackageId: item.templatePackageId,
        title: item.title,
        description: item.description,
        versionNumber: 1,
        category: item.category,
        primaryMasterVersionId: item.primaryMasterVersionId,
        paletteNodesJson: item.paletteNodesJson,
        constants: item.constants,
        members: item.members.map((m) => ({
          ...m,
          dagYaml: (m as any).dagYaml || "",
        })),
      }
    : null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Loading template workbench...
      </div>
    );
  }

  if (isWorkspaceError) {
    return (
      <div className="page-container space-y-4 text-sm text-destructive">
        {workspaceError?.message || "Failed to load the template workspace contract."}
      </div>
    );
  }

  if (!item || (!isGraphLoading && !graph)) {
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
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onPress={() => setIsForkModalOpen(true)}
            className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium shadow-sm"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Fork to Local Workspace
          </Button>
        </div>
      </div>

      {/* Outliner + Read-Only Canvas */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <TemplateOutliner
          members={item.members}
          selectedVersionId={selectedVersionId}
          onSelect={setSelectedVersionId}
        />

        <div className="flex-1 min-w-0 min-h-0">
          {isGraphLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Loading pipeline graph...</span>
            </div>
          ) : graph && workspace ? (
            <PipelineWorkspaceProvider workspace={workspace}>
              <PipelineCanvas
                projectId="cloud-template"
                graph={graph}
                readOnly
              />
            </PipelineWorkspaceProvider>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Select a Master Pipeline or Component from the left outliner.
            </div>
          )}
        </div>
      </div>

      {templateDetailShim && (
        <ForkTemplateDialog
          isOpen={isForkModalOpen}
          onClose={() => setIsForkModalOpen(false)}
          template={templateDetailShim as any}
        />
      )}
    </div>
  );
}
