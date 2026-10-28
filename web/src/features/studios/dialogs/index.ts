import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";
import type { EditStudioDialogPayload } from "./EditStudioDialog";

declare module "@/lib/dialog-registry" {
  interface GlobalDialogRegistry {
    "create-studio": undefined;
    "edit-studio": EditStudioDialogPayload | undefined;
  }
}

const CreateStudioDialog = lazy(() =>
  import("./CreateStudioDialog").then((m) => ({
    default: m.CreateStudioDialog,
  }))
);

const EditStudioDialog = lazy(() =>
  import("./EditStudioDialog").then((m) => ({
    default: m.EditStudioDialog,
  }))
);

registerDialog({
  id: "create-studio",
  component: CreateStudioDialog,
});

registerDialog({
  id: "edit-studio",
  component: EditStudioDialog,
});
