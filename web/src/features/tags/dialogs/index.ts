import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";
import type { CreateTagData } from "./CreateTagDialog";
import type { BulkCreateTagData } from "./BulkCreateTagDialog";

declare module "@/lib/dialog-registry" {
    interface GlobalDialogRegistry {
        "create-tag": CreateTagData;
        "bulk-create-tag": BulkCreateTagData;
    }
}

const CreateTagDialog = lazy(() =>
    import("./CreateTagDialog").then((m) => ({
        default: m.CreateTagDialog,
    }))
);

const BulkCreateTagDialog = lazy(() =>
    import("./BulkCreateTagDialog").then((m) => ({
        default: m.BulkCreateTagDialog,
    }))
);

registerDialog({
    id: "create-tag",
    component: CreateTagDialog,
});

registerDialog({
    id: "bulk-create-tag",
    component: BulkCreateTagDialog,
});
