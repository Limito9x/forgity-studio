import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";

declare module "@/lib/dialog-registry" {
    interface GlobalDialogRegistry {
        "create-project": undefined;
        "update-project": { id: string };
        "delete-project": { id: string };
    }
}

const CreateProjectDialog = lazy(() =>
    import("./CreateProjectDialog").then((m) => ({
        default: m.CreateProjectDialog
    }))
);

const UpdateProjectDialog = lazy(() =>
    import("./UpdateProjectDialog").then((m) => ({
        default: m.UpdateProjectDialog
    }))
);

const DeleteProjectDialog = lazy(() =>
    import("./DeleteProjectDialog").then((m) => ({
        default: m.DeleteProjectDialog
    }))
);

registerDialog({
    id: "create-project",
    component: CreateProjectDialog
});

registerDialog({
    id: "update-project",
    component: UpdateProjectDialog
});

registerDialog({
    id: "delete-project",
    component: DeleteProjectDialog
});
