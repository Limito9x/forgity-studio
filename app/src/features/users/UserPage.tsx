import { UserTable } from "./components/UserTable";
import { useResourceQuery, type ResourcePageProps } from "@/lib/useResourceQuery";
import { ResourcePageShell } from "@/components/layout/shells/ResourcePageShell";
import { userFilterConfig } from "./components/userFilter";
import { useUsers } from "./hooks/useUsers";
import { useUserTable } from "./hooks/useUserTable";
import { useTranslation } from "react-i18next";
import { DataTableViewOptions } from "@/components/table/DataTableViewOptions";
import { useDialogStore } from "@/stores/dialogStore";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

export function UserPage({ useSearch, useNavigate }: ResourcePageProps) {
    const { t } = useTranslation("users");
    // ── Route infrastructure
    const search = useSearch();
    const navigate = useNavigate();
    const openDialog = useDialogStore((state) => state.openDialog);

    // ── Hook quản lý params + TanStack Table adapters
    const resourceQuery = useResourceQuery(search, navigate);

    // ── Data fetching
    const { data, isLoading, refetch } = useUsers(search);

    // ── Table setup
    const { table, columns } = useUserTable({
        data: data?.items ?? [],
        totalCount: data?.totalCount ?? 0,
        resource: resourceQuery,
    });

    return (
        <ResourcePageShell
            title={t("page.title")}
            onAdd={() => navigate({ to: "/users/new" })}
            addLabel="Add User"
            actions={
                <Button
                    variant="outline"
                    onPress={() => openDialog("bulk-invite-users", { onSuccess: () => refetch() })}
                    className="gap-1.5"
                >
                    <UserPlus className="size-4 text-primary" />
                    Bulk Invite Beta Testers
                </Button>
            }
            resource={resourceQuery}
            filterConfig={userFilterConfig}
            searchPlaceholder={t("page.searchPlaceholder")}
            renderViewOptions={<DataTableViewOptions table={table} />}
        >
            <UserTable
                table={table}
                columns={columns}
                isLoading={isLoading}
            />
        </ResourcePageShell>
    );
}
