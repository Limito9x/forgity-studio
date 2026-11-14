import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";
import type { EditStudioDialogPayload } from "./EditStudioDialog";

import type { StudioQuotaDto } from "../hooks/useStudioQuota";

declare module "@/lib/dialog-registry" {
  interface GlobalDialogRegistry {
    "create-studio": undefined;
    "edit-studio": EditStudioDialogPayload | undefined;
    "upgrade-plan": { quota?: StudioQuotaDto } | undefined;
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

const UpgradePlanModal = lazy(() =>
  import("./UpgradePlanModal").then((m) => ({
    default: m.UpgradePlanModal,
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

registerDialog({
  id: "upgrade-plan",
  component: UpgradePlanModal as any,
});
