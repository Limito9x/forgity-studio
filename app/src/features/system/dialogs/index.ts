import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";

declare module "@/lib/dialog-registry" {
    interface GlobalDialogRegistry {
        "update-system-setting": { id: string };
    }
}

const UpdateSystemSettingDialog = lazy(() =>
    import("../components/settings/UpdateSystemSettingDialog").then((m) => ({
        default: m.UpdateSystemSettingDialog
    }))
);

registerDialog({
    id: "update-system-setting",
    component: UpdateSystemSettingDialog
});
