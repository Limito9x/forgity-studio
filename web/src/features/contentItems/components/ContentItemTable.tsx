import { useTranslation } from "react-i18next";
import { BaseTable } from "@/components/table/BaseTable";
import type { ColumnDef, Table } from "@tanstack/react-table";
import type { ContentItemDto } from "@/gen/model";

export interface ContentItemTableProps {
    table: Table<ContentItemDto>;
    columns: ColumnDef<ContentItemDto>[];
    isLoading: boolean;
    content?: string;
}

export function ContentItemTable({
    table,
    columns,
    isLoading,
    content
}: ContentItemTableProps) {

    return (
        <BaseTable
            table={table}
            columns={columns}
            isLoading={isLoading}
            caption={`${content} list`}
        />
    );
}
