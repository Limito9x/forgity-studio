import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";

declare module "@/lib/dialog-registry" {
    interface GlobalDialogRegistry {
        "create-struct": { projectId: string };
        "delete-struct": { projectId: string; structId: string; structName?: string };
    }
}

const CreateStructDialog = lazy(() =>
    import("./CreateStructDialog").then((m) => ({
        default: m.CreateStructDialog
    }))
);

const DeleteStructDialog = lazy(() =>
    import("./DeleteStructDialog").then((m) => ({
        default: m.DeleteStructDialog
    }))
);

registerDialog({
    id: "create-struct",
    component: CreateStructDialog
});

registerDialog({
    id: "delete-struct",
    component: DeleteStructDialog
});
