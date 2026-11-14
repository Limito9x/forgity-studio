import type { Table } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Settings2,
    TypeIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";

interface DataTableViewOptionsProps<TData> {
    table: Table<TData>;
}

export function DataTableViewOptions<TData>({
    table,
}: DataTableViewOptionsProps<TData>) {
    const { t } = useTranslation("common");

    const columns = table
        .getAllColumns()
        .filter(
            (column) =>
                typeof column.accessorFn !== "undefined" && column.getCanHide()
        );

    const columnVisibility = table.getState().columnVisibility;

    const selectedKeys = useMemo(() => {
        return new Set(
            columns
                .filter((column) => column.getIsVisible())
                .map((column) => column.id)
        );
    }, [columns, columnVisibility]);

    if (columns.length === 0) return null;

    return (
        <DropdownMenuTrigger>
            <Button
                variant="outline"
                size="sm"
                className="ml-auto flex h-8 data-[state=open]:bg-muted"
            >
                <Settings2 className="mr-2 h-4 w-4" />
                {t("view", { defaultValue: "View" })}
            </Button>
            <DropdownMenu
                placement="bottom end"
                className="w-[200px]"
                selectionMode="multiple"
                selectedKeys={selectedKeys}
                onSelectionChange={(keys) => {
                    const newVisibility = { ...table.getState().columnVisibility };
                    if (keys === "all") {
                        columns.forEach((column) => {
                            newVisibility[column.id] = true;
                        });
                    } else {
                        const keySet = new Set(keys as Iterable<string>);
                        columns.forEach((column) => {
                            newVisibility[column.id] = keySet.has(column.id);
                        });
                    }
                    table.setColumnVisibility(newVisibility);
                }}
            >
                <DropdownMenuLabel>
                    {t("toggleColumns", { defaultValue: "Toggle columns" })}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.map((column) => {
                    const meta = column.columnDef.meta;
                    const Icon = meta?.icon ?? TypeIcon;
                    const title = meta?.label ?? column.id;

                    return (
                        <DropdownMenuItem
                            key={column.id}
                            id={column.id}
                            className="capitalize"
                        >
                            <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4 text-muted-foreground" />
                                <span>{title}</span>
                            </div>
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenu>
        </DropdownMenuTrigger>
    );
}
