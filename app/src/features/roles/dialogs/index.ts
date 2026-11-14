import { lazy } from "react";
import { registerDialog } from "@/lib/dialog-registry";

declare module "@/lib/dialog-registry" {
    interface GlobalDialogRegistry {
        "create-role": undefined;
        "update-role": { id: string };
        "delete-role": { id: string };
        "update-role-permissions": { id: string };
    }
}

const CreateRoleDialog = lazy(() =>
    import("./CreateRoleDialog").then((m) => ({
        default: m.CreateRoleDialog
    }))
);

const UpdateRoleDialog = lazy(() =>
    import("./UpdateRoleDialog").then((m) => ({
        default: m.UpdateRoleDialog
    }))
);

const DeleteRoleDialog = lazy(() =>
    import("./DeleteRoleDialog").then((m) => ({
        default: m.DeleteRoleDialog
    }))
);

const RolePermissionsDialog = lazy(() =>
    import("./RolePermissionsDialog").then((m) => ({
        default: m.RolePermissionsDialog
    }))
);

registerDialog({
    id: "create-role",
    component: CreateRoleDialog
});

registerDialog({
    id: "update-role",
    component: UpdateRoleDialog
});

registerDialog({
    id: "delete-role",
    component: DeleteRoleDialog
});

registerDialog({
    id: "update-role-permissions",
    component: RolePermissionsDialog
});
