import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useDialogStore } from "@/stores/dialogStore";
import { DataTableRowActions } from "@/components/table/DataTableRowActions";
import type { BaseSearchParams, useResourceQuery } from "@/lib/useResourceQuery";
import type { ColumnDef } from "@tanstack/react-table";
import type { UserDto } from "@/gen/model";
import { useBulkUpdateUserStatus } from "@/gen/endpoints/users/users";
import { EditIcon, TrashIcon, ShieldIcon, TypeIcon, HashIcon, TagsIcon, ActivityIcon, PowerIcon, EyeIcon } from "lucide-react";
import { useDataTable } from "@/lib/useDataTable";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export interface UseUserTableOptions {
    data: UserDto[];
    totalCount: number;
    resource: ReturnType<typeof useResourceQuery<BaseSearchParams>>;
}

export function useUserTable({ data, totalCount, resource }: UseUserTableOptions) {
    const { t } = useTranslation(["users", "common"]);
    const openDialog = useDialogStore((state) => state.openDialog);
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const bulkUpdateStatus = useBulkUpdateUserStatus();

    const columns = useMemo<ColumnDef<UserDto>[]>(
        () => [
            {
                accessorKey: "userName",
                header: () => t("fields.userName"),
                meta: { label: t("fields.userName"), icon: TypeIcon },
                cell: (info) => (
                    <span className="font-semibold text-foreground">
                        {info.getValue() as string}
                    </span>
                ),
            },
            {
                accessorKey: "displayName",
                header: () => t("fields.fullName"),
                meta: { label: t("fields.fullName"), icon: TypeIcon },
                cell: (info) =>
                    (info.getValue() as string) || (
                        <span className="text-muted-foreground">-</span>
                    ),
            },
            {
                accessorKey: "email",
                header: () => t("fields.email"),
                meta: { label: t("fields.email"), icon: TypeIcon },
            },
            {
                accessorKey: "phoneNumber",
                header: () => t("fields.phoneNumber"),
                meta: { label: t("fields.phoneNumber"), icon: HashIcon },
                cell: (info) =>
                    (info.getValue() as string) || (
                        <span className="text-muted-foreground">-</span>
                    ),
            },
            {
                accessorKey: "status",
                header: () => t("fields.status", { defaultValue: "Status" }),
                meta: { label: t("fields.status", { defaultValue: "Status" }), icon: ActivityIcon },
                cell: (info) => {
                    const status = info.getValue() as number;
                    // 1: Active, 2: Inactive, 3: Suspended
                    if (status === 1) {
                        return <span className="inline-flex items-center rounded-md bg-green-500/10 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">{t("status.active", { defaultValue: "Active" })}</span>;
                    }
                    if (status === 2) {
                        return <span className="inline-flex items-center rounded-md bg-gray-500/10 px-2 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-400">{t("status.inactive", { defaultValue: "Inactive" })}</span>;
                    }
                    if (status === 3) {
                        return <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">{t("status.suspended", { defaultValue: "Suspended" })}</span>;
                    }
                    return <span className="text-muted-foreground">-</span>;
                },
            },
            {
                accessorKey: "roles",
                header: t("fields.roles"),
                meta: { label: t("fields.roles"), icon: TagsIcon },
                enableSorting: false,
                cell: (info) => {
                    const roles = info.getValue() as any[] | undefined;
                    return (
                        <div className="flex flex-wrap gap-1">
                            {roles?.map((role: any) => (
                                <span
                                    key={role.id || role.name || role}
                                    className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
                                >
                                    {role.name || role}
                                </span>
                            )) || (
                                    <span className="text-muted-foreground">-</span>
                                )}
                        </div>
                    );
                },
            },
            {
                id: "actions",
                enableSorting: false,
                cell: ({ row }) => {
                    const user = row.original;
                    const isInactive = user.status === 2; // Inactive

                    const handleToggleStatus = () => {
                        const targetStatus = isInactive ? 1 : 2; // Active = 1, Inactive = 2
                        bulkUpdateStatus.mutate({
                            data: {
                                userIds: [user.id!],
                                targetStatus: targetStatus
                            }
                        }, {
                            onSuccess: () => {
                                toast.success(t("messages.statusUpdated", { defaultValue: "User status updated" }));
                                queryClient.invalidateQueries({ queryKey: ["/api/users"] });
                            },
                            onError: () => {
                                toast.error(t("messages.statusUpdateFailed", { defaultValue: "Failed to update status" }));
                            }
                        });
                    };

                    return (
                        <DataTableRowActions
                            actions={[
                                {
                                    label: t("common:viewDetails", { defaultValue: "View Details" }),
                                    icon: EyeIcon,
                                    onClick: () => navigate({ to: "/users/$id", params: { id: user.id! } }),
                                },
                                {
                                    label: t("common:Edit", { defaultValue: "Edit" }),
                                    icon: EditIcon,
                                    onClick: () => navigate({ to: "/users/$id/edit", params: { id: user.id! } }),
                                },
                                {
                                    label: t("actions.assignRoles", { defaultValue: "Assign Roles" }),
                                    icon: ShieldIcon,
                                    onClick: () => openDialog("assign-user-roles", { id: user.id! }),
                                },
                                {
                                    label: isInactive ? t("actions.activate", { defaultValue: "Activate" }) : t("actions.deactivate", { defaultValue: "Deactivate" }),
                                    icon: PowerIcon,
                                    onClick: handleToggleStatus,
                                },
                                {
                                    label: t("common:delete", { defaultValue: "Delete" }),
                                    icon: TrashIcon,
                                    onClick: () => openDialog("delete-user", { id: user.id! }),
                                    destructive: true,
                                    separatorBefore: true,
                                }
                            ]}
                        />
                    );
                },
            },
        ],
        [openDialog, navigate, t, bulkUpdateStatus, queryClient]
    );

    const table = useDataTable({ data, columns, totalCount, resource });

    return { table, columns };
}
