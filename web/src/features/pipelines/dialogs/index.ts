import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";
import type { PipelineSummaryDto } from "@/gen/model";

declare module "@/lib/dialog-registry" {
  interface GlobalDialogRegistry {
    "create-pipeline": { projectId: string };
    "rename-pipeline": { pipeline: PipelineSummaryDto };
    "archive-pipeline": { pipeline: PipelineSummaryDto };
    "purge-pipeline": { pipeline: PipelineSummaryDto };
    "import-pipeline": { projectId: string };
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
