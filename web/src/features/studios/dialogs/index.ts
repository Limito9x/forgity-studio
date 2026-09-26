import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";

declare module "@/lib/dialog-registry" {
  interface GlobalDialogRegistry {
    "create-studio": undefined;
  }
}

const CreateStudioDialog = lazy(() =>
  import("./CreateStudioDialog").then((m) => ({
    default: m.CreateStudioDialog,
  }))
);

registerDialog({
  id: "create-studio",
  component: CreateStudioDialog,
});
