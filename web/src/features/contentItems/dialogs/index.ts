import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";

declare module "@/lib/dialog-registry" {
    interface GlobalDialogRegistry {
        "delete-content-item": { id: string; typeKey: string; projectId: string };
        "import-content-items": import("./ImportContentItemDialog").ImportContentItemsDialogData;
    }
}

const DeleteContentItemDialog = lazy(() =>
    import("./DeleteContentItemDialog").then((m) => ({
        default: m.DeleteContentItemDialog
    }))
);

const ImportContentItemDialog = lazy(() =>
    import("./ImportContentItemDialog").then((m) => ({
        default: m.ImportContentItemDialog
    }))
);

registerDialog({
    id: "delete-content-item",
    component: DeleteContentItemDialog
});

registerDialog({
    id: "import-content-items",
    component: ImportContentItemDialog
});

