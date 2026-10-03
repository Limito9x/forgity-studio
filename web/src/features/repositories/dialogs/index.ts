import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";
import type { CreateRepositoryDialogData } from "./CreateRepositoryDialog";
import type { UpdateRepositoryDialogData } from "./UpdateRepositoryDialog";
import type { DeleteRepositoryDialogData } from "./DeleteRepositoryDialog";
import type { AttachRunnerToRepositoryDialogData } from "./AttachRunnerDialog";
declare module "@/lib/dialog-registry" {
  interface GlobalDialogRegistry {
    "create-repository": CreateRepositoryDialogData;
    "update-repository": UpdateRepositoryDialogData;
    "delete-repository": DeleteRepositoryDialogData;
    "attach-runner-to-repository": AttachRunnerToRepositoryDialogData;
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

import { AttachRunnerDialog } from "./AttachRunnerDialog";

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
  id: "attach-runner-to-repository",
  component: AttachRunnerDialog,
});
