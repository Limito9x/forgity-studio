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
import { Eye, Pencil, Trash2, FileCode, Sparkles, ArrowRight } from "lucide-react";
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
    onInspect: (node: NodePaletteItemDto) => void;
    onEdit: (node: NodePaletteItemDto) => void;
    onDelete: (node: NodePaletteItemDto) => void;
}

export function useNodeLibraryTable({ data, onInspect, onEdit, onDelete }: UseNodeLibraryTableOptions) {
    const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

    const columns = useMemo<ColumnDef<NodePaletteItemDto>[]>(
        () => [
            {
                id: "select",
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
            },
            {
                accessorKey: "label",
                header: "Node",
                cell: ({ row }) => {
                    const node = row.original;
                    const custom = isCustomNode(node);
                    const hasExec =
                        (node.inputs || []).some(isExecPin) ||
                        (node.outputs || []).some(isExecPin);
                    return (
                        <div className="flex items-center gap-2.5 py-1 min-w-[220px]">
                            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
                                <FileCode className="size-4" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span
                                        className="font-semibold text-foreground text-sm truncate"
                                        title={node.label || node.key}
                                    >
                                        {node.label || node.key}
                                    </span>
                                    {custom ? (
                                        <Badge
                                            variant="secondary"
                                            className="text-[9px] h-4.5 px-1.5 font-semibold shrink-0 uppercase tracking-wider"
                                        >
                                            <span className="flex items-center gap-1 text-primary">
                                                <Sparkles className="size-2" /> Custom
                                            </span>
                                        </Badge>
                                    ) : (
                                        <Badge
                                            variant="secondary"
                                            className="text-[9px] h-4.5 px-1.5 shrink-0 uppercase tracking-wider text-muted-foreground"
                                        >
                                            Built-in
                                        </Badge>
                                    )}
                                </div>
                                <p
                                    className="text-[11px] text-muted-foreground truncate max-w-xs font-mono"
                                    title={node.key}
                                >
                                    {node.key}
                                    {hasExec ? "  •  flow" : ""}
                                </p>
                            </div>
                        </div>
                    );
                },
            },
            {
                accessorKey: "executor",
                header: "Executor",
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
                            className="text-[10px] px-1.5 py-0 font-mono whitespace-nowrap"
                            style={
                                meta?.brandColor
                                    ? { borderColor: `${meta.brandColor}55`, color: meta.brandColor }
                                    : undefined
                            }
                        >
                            {meta?.iconUrl ? (
                                <img src={meta.iconUrl} alt={display} className="size-2.5 mr-1 object-contain" />
                            ) : null}
                            {display || "—"}
                        </Badge>
                    );
                },
            },
            {
                accessorKey: "category",
                header: "Category",
                cell: ({ row }) => (
                    <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">
                        {row.original.category || "—"}
                    </span>
                ),
            },
            {
                id: "inputs",
                header: "Inputs",
                cell: ({ row }) => {
                    const dataInputs = (row.original.inputs || []).filter((p) => !isExecPin(p));
                    if (dataInputs.length === 0) {
                        return <span className="text-[11px] text-muted-foreground/60 italic">None</span>;
                    }
                    return (
                        <div className="max-w-[280px]">
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
            },
            {
                id: "outputs",
                header: "Outputs",
                cell: ({ row }) => {
                    const dataOutputs = (row.original.outputs || []).filter((p) => !isExecPin(p));
                    if (dataOutputs.length === 0) {
                        return <span className="text-[11px] text-muted-foreground/60 italic">None</span>;
                    }
                    return (
                        <div className="max-w-[280px]">
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
            },
            {
                id: "actions",
                enableSorting: false,
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
            },
        ],
        [onInspect, onEdit, onDelete]
    );

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
