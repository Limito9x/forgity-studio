import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";
import type { RemoveTemplateDialogData } from "./RemoveTemplateDialog";

declare module "@/lib/dialog-registry" {
    interface GlobalDialogRegistry {
        "update-system-setting": { id: string };
        "remove-template": RemoveTemplateDialogData;
    }
}

const UpdateSystemSettingDialog = lazy(() =>
    import("../components/settings/UpdateSystemSettingDialog").then((m) => ({
        default: m.UpdateSystemSettingDialog
    }))
);

const RemoveTemplateDialog = lazy(() =>
    import("./RemoveTemplateDialog").then((m) => ({
        default: m.RemoveTemplateDialog
    }))
);

registerDialog({
    id: "update-system-setting",
    component: UpdateSystemSettingDialog
});

registerDialog({
    id: "remove-template",
    component: RemoveTemplateDialog
});
