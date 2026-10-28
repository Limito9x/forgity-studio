import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";
import type { CreateRepositoryDialogData } from "./CreateRepositoryDialog";
import type { UpdateRepositoryDialogData } from "./UpdateRepositoryDialog";
import type { DeleteRepositoryDialogData } from "./DeleteRepositoryDialog";
import type { AttachRunnerToRepositoryDialogData } from "./AttachRunnerDialog";
import type { DetachRunnerFromRepositoryDialogData } from "./DetachRunnerDialog";
import type { DeleteResourceDialogData } from "./DeleteResourceDialog";

declare module "@/lib/dialog-registry" {
  interface GlobalDialogRegistry {
    "create-repository": CreateRepositoryDialogData;
    "update-repository": UpdateRepositoryDialogData;
    "delete-repository": DeleteRepositoryDialogData;
    "attach-runner-to-repository": AttachRunnerToRepositoryDialogData;
    "detach-runner-from-repository": DetachRunnerFromRepositoryDialogData;
    "delete-resource": DeleteResourceDialogData;
  }
}

const CreateRepositoryDialog = lazy(() =>
  import("./CreateRepositoryDialog").then((m) => ({
    default: m.CreateRepositoryDialog,
  }))
);

const UpdateRepositoryDialog = lazy(() =>
  import("./UpdateRepositoryDialog").then((m) => ({
    default: m.UpdateRepositoryDialog,
  }))
);

const DeleteRepositoryDialog = lazy(() =>
  import("./DeleteRepositoryDialog").then((m) => ({
    default: m.DeleteRepositoryDialog,
  }))
);

const DeleteResourceDialog = lazy(() =>
  import("./DeleteResourceDialog").then((m) => ({
    default: m.DeleteResourceDialog,
  }))
);

import { AttachRunnerDialog } from "./AttachRunnerDialog";
import { DetachRunnerDialog } from "./DetachRunnerDialog";

registerDialog({
  id: "create-repository",
  component: CreateRepositoryDialog,
});

registerDialog({
  id: "update-repository",
  component: UpdateRepositoryDialog,
});

registerDialog({
  id: "delete-repository",
  component: DeleteRepositoryDialog,
});

registerDialog({
  id: "delete-resource",
  component: DeleteResourceDialog,
});

registerDialog({
  id: "attach-runner-to-repository",
  component: AttachRunnerDialog,
});

registerDialog({
  id: "detach-runner-from-repository",
  component: DetachRunnerDialog,
});

export { PublishVersionDialog } from "./PublishVersionDialog";
