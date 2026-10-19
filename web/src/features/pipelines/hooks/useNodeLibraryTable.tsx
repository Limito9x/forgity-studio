import { useMemo, useState } from "react";
import {
    type ColumnDef,
    getCoreRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DataTableRowActions } from "@/components/table/DataTableRowActions";
import { PinBadge } from "../components/PinBadge";
import { getSoftwareMetadata } from "@/features/runners/constants/dccEngines";
import { Eye, Pencil, Trash2, ArrowRight } from "lucide-react";
import type { NodePaletteItemDto, PinDefinition } from "@/gen/model";

export function isExecPin(pin: PinDefinition): boolean {
    return (
        pin.kind === 1 ||
        String(pin.id || "").toLowerCase() === "exec" ||
        String(pin.id || "").toLowerCase() === "exec_in" ||
        String(pin.id || "").toLowerCase() === "exec_out" ||
        String(pin.id || "").toLowerCase() === "loop_body" ||
        String(pin.id || "").toLowerCase() === "completed"
    );
}

export function isCustomNode(node: NodePaletteItemDto): boolean {
    return node.source === "Custom";
}

export interface UseNodeLibraryTableOptions {
    data: NodePaletteItemDto[];
    scope?: "custom" | "builtin";
    onInspect: (node: NodePaletteItemDto) => void;
    onEdit: (node: NodePaletteItemDto) => void;
    onDelete: (node: NodePaletteItemDto) => void;
}

export function useNodeLibraryTable({
    data,
    scope = "custom",
    onInspect,
    onEdit,
    onDelete,
}: UseNodeLibraryTableOptions) {
    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

    const columns = useMemo<ColumnDef<NodePaletteItemDto>[]>(() => {
        const isBuiltIn = scope === "builtin";

        const cols: ColumnDef<NodePaletteItemDto>[] = [];

        const STICKY_TH = "sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]";

        // 1. Select checkbox — Only for Custom scripts (Built-in tools cannot be batch selected/deleted)
        if (!isBuiltIn) {
            cols.push({
                id: "select",
                meta: { headerClassName: STICKY_TH },
                header: ({ table }) => {
                    const rows = table.getRowModel().rows;
                    const customRows = rows.filter((r) => isCustomNode(r.original));
                    const allChecked =
                        customRows.length > 0 && customRows.every((r) => r.getIsSelected());
                    const someChecked =
                        customRows.some((r) => r.getIsSelected()) && !allChecked;
                    return (
                        <div className="flex items-center justify-center pl-1">
                            <Checkbox
                                slot="selection"
                                isSelected={allChecked}
                                isIndeterminate={someChecked}
                                isDisabled={customRows.length === 0}
                                onChange={(checked) => {
                                    customRows.forEach((r) => r.toggleSelected(!!checked));
                                }}
                                aria-label="Select all custom nodes"
                            />
                        </div>
                    );
                },
                cell: ({ row }) => {
                    const custom = isCustomNode(row.original);
                    return (
                        <div className="flex items-center justify-center pl-1">
                            <Checkbox
                                slot="selection"
                                isSelected={row.getIsSelected()}
                                isDisabled={!custom}
                                onChange={(checked) => row.toggleSelected(!!checked)}
                                aria-label={
                                    custom
                                        ? `Select node ${row.original.label || row.original.key}`
                                        : "Built-in nodes cannot be batch selected"
                                }
                            />
                        </div>
                    );
                },
                enableSorting: false,
                size: 38,
            });
        }

        // 2. Node Column (Label + Key)
        cols.push({
            accessorKey: "label",
            header: "Node",
            meta: { headerClassName: STICKY_TH },
            cell: ({ row }) => {
                const node = row.original;
                const hasExec =
                    (node.inputs || []).some(isExecPin) ||
                    (node.outputs || []).some(isExecPin);
                return (
                    <div className="py-1 min-w-[220px]">
                        <div
                            className="font-semibold text-foreground text-sm truncate max-w-sm"
                            title={node.label || node.key}
                        >
                            {node.label || node.key}
                        </div>
                        <p
                            className="text-[11px] text-muted-foreground truncate font-mono mt-0.5"
                            title={node.key}
                        >
                            {node.key}
                            {hasExec ? "  •  flow" : ""}
                        </p>
                    </div>
                );
            },
        });

        // 3. Executor Column — Only for Custom Scripts (Built-in tools always run on server core)
        if (!isBuiltIn) {
            cols.push({
                accessorKey: "executor",
                header: "Executor",
                meta: { headerClassName: STICKY_TH },
                cell: ({ row }) => {
                    const node = row.original;
                    const exec = (node.executor || "").toLowerCase();
                    const display =
                        exec === "dotnet" || exec === "builtin"
                            ? "Core"
                            : getSoftwareMetadata(node.executor || "").name || node.executor;
                    const meta =
                        exec === "dotnet" || exec === "builtin"
                            ? null
                            : getSoftwareMetadata(node.executor || "");
                    return (
                        <Badge
                            variant="outline"
                            className="text-xs px-2.5 py-1 font-medium whitespace-nowrap rounded-md inline-flex items-center gap-1.5 border-border/70 bg-muted/30"
                            style={
                                meta?.brandColor
                                    ? { borderColor: `${meta.brandColor}55`, color: meta.brandColor }
                                    : undefined
                            }
                        >
                            {meta?.iconUrl ? (
                                <img src={meta.iconUrl} alt={display} className="size-3.5 object-contain shrink-0" />
                            ) : null}
                            <span>{display || "—"}</span>
                        </Badge>
                    );
                },
            });
        } else {
            // Built-in tools have rich categories (Flow Control, Math, Tags, etc.)
            cols.push({
                accessorKey: "category",
                header: "Category",
                meta: { headerClassName: STICKY_TH },
                cell: ({ row }) => (
                    <Badge
                        variant="secondary"
                        className="text-xs px-2 py-0.5 font-medium whitespace-nowrap bg-muted/60 text-muted-foreground border border-border/50"
                    >
                        {row.original.category || "General"}
                    </Badge>
                ),
            });
        }

        // 4. Description Column
        cols.push({
            id: "description",
            header: "Description",
            meta: { headerClassName: STICKY_TH },
            cell: ({ row }) => {
                const desc = (row.original as Record<string, any>).description as string | undefined;
                return (
                    <div className="min-w-[200px] max-w-[340px]">
                        <span
                            className="text-xs text-muted-foreground line-clamp-2 leading-relaxed block"
                            title={desc || undefined}
                        >
                            {desc || "—"}
                        </span>
                    </div>
                );
            },
        });

        // 5. Inputs Column
        cols.push({
            id: "inputs",
            header: "Inputs",
            meta: { headerClassName: STICKY_TH },
            cell: ({ row }) => {
                const dataInputs = (row.original.inputs || []).filter((p) => !isExecPin(p));
                if (dataInputs.length === 0) {
                    return <span className="text-[11px] text-muted-foreground/60 italic">None</span>;
                }
                return (
                    <div className="max-w-[260px]">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium mb-1">
                            <ArrowRight className="size-2.5 text-blue-500" />
                            In ({dataInputs.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {dataInputs.slice(0, 2).map((pin) => (
                                <PinBadge key={pin.id} pin={pin} direction="in" compact />
                            ))}
                            {dataInputs.length > 2 && (
                                <span className="text-[10px] text-primary font-mono">
                                    +{dataInputs.length - 2} more
                                </span>
                            )}
                        </div>
                    </div>
                );
            },
        });

        // 6. Outputs Column
        cols.push({
            id: "outputs",
            header: "Outputs",
            meta: { headerClassName: STICKY_TH },
            cell: ({ row }) => {
                const dataOutputs = (row.original.outputs || []).filter((p) => !isExecPin(p));
                if (dataOutputs.length === 0) {
                    return <span className="text-[11px] text-muted-foreground/60 italic">None</span>;
                }
                return (
                    <div className="max-w-[260px]">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium mb-1">
                            <ArrowRight className="size-2.5 text-emerald-500" />
                            Out ({dataOutputs.length})
                        </div>
                        <div className="flex flex-wrap gap-1">
                            {dataOutputs.slice(0, 2).map((pin) => (
                                <PinBadge key={pin.id} pin={pin} direction="out" compact />
                            ))}
                            {dataOutputs.length > 2 && (
                                <span className="text-[10px] text-primary font-mono">
                                    +{dataOutputs.length - 2} more
                                </span>
                            )}
                        </div>
                    </div>
                );
            },
        });

        // 7. Actions Column
        cols.push({
            id: "actions",
            enableSorting: false,
            meta: { headerClassName: STICKY_TH },
            cell: ({ row }) => {
                const node = row.original;
                const custom = isCustomNode(node);
                return (
                    <DataTableRowActions
                        actions={[
                            {
                                label: "Inspect pins",
                                icon: Eye,
                                onClick: () => onInspect(node),
                            },
                            ...(custom && node.id
                                ? [
                                      {
                                          label: "Edit",
                                          icon: Pencil,
                                          onClick: () => onEdit(node),
                                      },
                                      {
                                          label: "Delete",
                                          icon: Trash2,
                                          onClick: () => onDelete(node),
                                          destructive: true,
                                          separatorBefore: true,
                                      },
                                  ]
                                : []),
                        ]}
                    />
                );
            },
        });

        return cols;
    }, [scope, onInspect, onEdit, onDelete]);

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getRowId: (row) => row.id || `${row.source}:${row.key}`,
        initialState: {
            pagination: { pageIndex: 0, pageSize: 20 },
        },
        state: { rowSelection },
        onRowSelectionChange: setRowSelection,
        enableRowSelection: (row) => isCustomNode(row.original),
    });

    const selectedNodes = useMemo(
        () => table.getSelectedRowModel().rows.map((r) => r.original),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [table, rowSelection]
    );

    return { table, columns, selectedNodes, rowSelection, setRowSelection };
}
