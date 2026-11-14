import { useNavigate } from "@tanstack/react-router";
import { useGetAuditLogById } from "../../hooks/useAuditLogs";
import { SinglePageShell } from "@/components/layout/shells/SinglePageShell";
import { Temporal } from "@js-temporal/polyfill";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export function AuditLogDetailPage({ id }: { id: string }) {
    const navigate = useNavigate();
    const { data: log, isLoading } = useGetAuditLogById(id);

    return (
        <SinglePageShell
            title="Audit Log Details"
            description="View details for log entry"
            onBack={() => navigate({ to: "/system/audit-logs" })}
        >
            {isLoading ? (
                <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-40 w-full" />
                </div>
            ) : !log ? (
                <div className="flex items-center justify-center p-12 text-muted-foreground border border-dashed rounded-md">
                    Log entry not found.
                </div>
            ) : (
                <div className="grid gap-6">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground font-medium">Action</span>
                            <span className="font-semibold">{log.action}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground font-medium">Entity Name</span>
                            <span>{log.entityName}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground font-medium">Entity ID</span>
                            <span className="truncate" title={log.entityId}>{log.entityId}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground font-medium">User ID</span>
                            <span>{log.userId || "-"}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground font-medium">Timestamp</span>
                            <span>{log.timestamp ? Temporal.Instant.from(log.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : "-"}</span>
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground font-medium">IP Address</span>
                            <span>{log.ipAddress || "-"}</span>
                        </div>
                        <div className="flex flex-col gap-1 col-span-2">
                            <span className="text-sm text-muted-foreground font-medium">User Agent</span>
                            <span className="truncate text-xs" title={log.userAgent ?? ""}>{log.userAgent || "-"}</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4">
                        <h3 className="font-semibold text-lg border-b pb-2">Changes</h3>
                        <AuditLogDiffViewer oldValues={log.oldValues} newValues={log.newValues} />
                    </div>
                </div>
            )}
        </SinglePageShell>
    );
}

function tryParse(val?: string | null): Record<string, any> {
    if (!val) return {};
    try {
        const parsed = JSON.parse(val);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
        return {};
    }
}

function AuditLogDiffViewer({ oldValues, newValues }: { oldValues?: string | null, newValues?: string | null }) {
    const oldObj = tryParse(oldValues);
    const newObj = tryParse(newValues);

    const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)])).sort();

    if (allKeys.length === 0) {
        return <div className="p-4 border border-dashed rounded-md text-muted-foreground text-center">No trackable data</div>;
    }

    return (
        <div className="rounded-md border bg-card">
            <Table aria-label="Audit Log Changes">
                <TableHeader>
                    <TableHead className="w-[30%] text-left" isRowHeader>Property</TableHead>
                    <TableHead className="w-[35%] text-left">Old Value</TableHead>
                    <TableHead className="w-[35%] text-left">New Value</TableHead>
                </TableHeader>
                <TableBody>
                    {allKeys.map(key => {
                        const oldVal = oldObj[key];
                        const newVal = newObj[key];
                        const isChanged = oldVal !== newVal && (oldValues != null && newValues != null);
                        const isAdded = oldVal === undefined && newVal !== undefined;
                        const isRemoved = oldVal !== undefined && newVal === undefined;

                        return (
                            <TableRow key={key} id={key}>
                                <TableCell className="font-medium text-xs whitespace-normal break-all">{key}</TableCell>
                                <TableCell className={cn("text-xs font-mono whitespace-normal break-all", isChanged || isRemoved ? "bg-red-500/10 text-red-600 dark:text-red-400" : "")}>
                                    {renderValue(oldVal)}
                                </TableCell>
                                <TableCell className={cn("text-xs font-mono whitespace-normal break-all", isChanged || isAdded ? "bg-green-500/10 text-green-600 dark:text-green-400" : "")}>
                                    {renderValue(newVal)}
                                </TableCell>
                            </TableRow>
                        )
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

function renderValue(val: any) {
    if (val === undefined) return <span className="text-muted-foreground italic">none</span>;
    if (val === null) return <span className="text-muted-foreground italic">null</span>;
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
}
