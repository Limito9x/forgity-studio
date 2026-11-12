import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";
import type { PipelineSummaryDto } from "@/gen/model";
import type { LocalStructDefinition } from "../types/workspaceConfig";

declare module "@/lib/dialog-registry" {
  interface GlobalDialogRegistry {
    "create-pipeline": { projectId: string };
    "rename-pipeline": { pipeline: PipelineSummaryDto };
    "archive-pipeline": { pipeline: PipelineSummaryDto };
    "purge-pipeline": { pipeline: PipelineSummaryDto };
    "import-pipeline": { projectId: string };
    "workspace-config": { projectId: string };
    "workspace-pull-studio": { projectId: string };
    "workspace-unpack-package": undefined;
    "workspace-struct-preview": { struct: LocalStructDefinition };
  }
}

const CreatePipelineDialog = lazy(() =>
  import("./CreatePipelineDialog").then((m) => ({
    default: m.CreatePipelineDialog,
  }))
);

const RenamePipelineDialog = lazy(() =>
  import("./RenamePipelineDialog").then((m) => ({
    default: m.RenamePipelineDialog,
  }))
);

const ArchivePipelineDialog = lazy(() =>
  import("./ArchivePipelineDialog").then((m) => ({
    default: m.ArchivePipelineDialog,
  }))
);

const PurgePipelineDialog = lazy(() =>
  import("./PurgePipelineDialog").then((m) => ({
    default: m.PurgePipelineDialog,
  }))
);

const PipelineImportDialogWrapper = lazy(() =>
  import("./PipelineImportDialogWrapper").then((m) => ({
    default: m.PipelineImportDialogWrapper,
  }))
);

const WorkspaceConfigDialog = lazy(() =>
  import("../components/workspace/WorkspaceConfigDialog").then((m) => ({
    default: m.WorkspaceConfigDialog,
  }))
);

const PullStudioPipelineDialog = lazy(() =>
  import("../components/workspace/PullStudioPipelineDialog").then((m) => ({
    default: m.PullStudioPipelineDialog,
  }))
);

const UnpackLocalPackageDialog = lazy(() =>
  import("../components/workspace/UnpackLocalPackageDialog").then((m) => ({
    default: m.UnpackLocalPackageDialog,
  }))
);

const LocalStructPreviewDialog = lazy(() =>
  import("../components/workspace/LocalStructPreviewDialog").then((m) => ({
    default: m.LocalStructPreviewDialog,
  }))
);

registerDialog({
  id: "workspace-config",
  component: WorkspaceConfigDialog,
});

registerDialog({
  id: "workspace-pull-studio",
  component: PullStudioPipelineDialog,
});

registerDialog({
  id: "workspace-unpack-package",
  component: UnpackLocalPackageDialog,
});

registerDialog({
  id: "workspace-struct-preview",
  component: LocalStructPreviewDialog,
});

registerDialog({
  id: "create-pipeline",
  component: CreatePipelineDialog,
});

registerDialog({
  id: "rename-pipeline",
  component: RenamePipelineDialog,
});

registerDialog({
  id: "archive-pipeline",
  component: ArchivePipelineDialog,
});

registerDialog({
  id: "purge-pipeline",
  component: PurgePipelineDialog,
});

registerDialog({
  id: "import-pipeline",
  component: PipelineImportDialogWrapper,
});

export { PipelineSnapshotHistoryDialog } from "./PipelineSnapshotHistoryDialog";

