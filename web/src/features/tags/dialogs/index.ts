import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";
import type { CreateTagData } from "./CreateTagDialog";
import type { BulkCreateTagData } from "./BulkCreateTagDialog";
import type { ImportTagsData } from "./ImportTagsDialog";

declare module "@/lib/dialog-registry" {
    interface GlobalDialogRegistry {
        "create-tag": CreateTagData;
        "bulk-create-tag": BulkCreateTagData;
        "import-tags": ImportTagsData;
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

const ImportTagsDialog = lazy(() =>
    import("./ImportTagsDialog").then((m) => ({
        default: m.ImportTagsDialog,
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

registerDialog({
    id: "import-tags",
    component: ImportTagsDialog,
});
