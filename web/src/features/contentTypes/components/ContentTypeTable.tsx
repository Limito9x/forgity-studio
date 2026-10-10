import { useTranslation } from "react-i18next";
import { BaseTable } from "@/components/table/BaseTable";
import type { ColumnDef, Table } from "@tanstack/react-table";
import type { ContentTypeDto } from "@/gen/model";

export interface ContentTypeTableProps {
    table: Table<ContentTypeDto>;
    columns: ColumnDef<ContentTypeDto>[];
    isLoading: boolean;
}

export function ContentTypeTable({
    table,
    columns,
    isLoading,
}: ContentTypeTableProps) {
    const { t } = useTranslation(["contentTypes", "common"]);

    return (
        <BaseTable
            table={table}
            columns={columns}
            isLoading={isLoading}
            caption={t("page.listCaption", { defaultValue: "Content Type List" })}
        />
    );
}
