import { BaseTable, type BaseTableProps } from "@/components/table/BaseTable";
import type { AuditLogDto } from "@/gen/model";

interface AuditLogTableProps extends BaseTableProps<AuditLogDto> {
}

export function AuditLogTable(props: AuditLogTableProps) {

    return (
        <BaseTable
            {...props}
        />
    );
}
