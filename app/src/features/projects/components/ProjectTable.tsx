import { useTranslation } from "react-i18next";
import { BaseTable } from "@/components/table/BaseTable";
import type { ColumnDef, Table } from "@tanstack/react-table";
import type { ProjectDto } from "@/gen/model";

export interface ProjectTableProps {
    table: Table<ProjectDto>;
    columns: ColumnDef<ProjectDto>[];
    isLoading: boolean;
}

export function ProjectTable({
    table,
    columns,
    isLoading,
}: ProjectTableProps) {
    const { t } = useTranslation(["projects", "common"]);

    return (
        <BaseTable
            table={table}
            columns={columns}
            isLoading={isLoading}
            caption={t("table.caption", { defaultValue: "Project List" })}
        />
    );
}
