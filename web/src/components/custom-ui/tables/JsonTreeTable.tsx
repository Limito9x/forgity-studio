import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronRight, Search, Braces, Table2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TagDroppableCell } from "@/features/tags/components/TagDroppableCell";
import type { TagLinkDetailDto } from "@/features/tags/types";
import { cn } from "@/lib/utils";

interface JsonTreeTableProps {
    data: any;
    className?: string;
    tagsByPath?: Record<string, TagLinkDetailDto[]>;
    entityId?: string;
    entityType?: string;
}

export function JsonTreeTable({
    data,
    className = "",
    tagsByPath = {},
    entityId,
    entityType = "Inspection",
}: JsonTreeTableProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState("");

    const parsedData = useMemo(() => {
        if (typeof data === "string") {
            try {
                return JSON.parse(data);
            } catch {
                return data;
            }
        }
        return data;
    }, [data]);

    if (!parsedData || (typeof parsedData !== "object" && !Array.isArray(parsedData))) {
        return (
            <div className="p-4 text-xs font-mono bg-muted/40 rounded border overflow-x-auto">
                {String(parsedData)}
            </div>
        );
    }

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Search Filter Header */}
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                    placeholder={t("inspections.filterReport", { defaultValue: "Filter inspection metrics..." })}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-xs bg-card"
                />
            </div>

            {/* Tree / Table Content */}
            <div className="border rounded-lg bg-card overflow-hidden divide-y divide-border">
                {renderNode("", parsedData, searchQuery, "", { tagsByPath, entityId, entityType })}
            </div>
        </div>
    );
}

interface RenderContext {
    tagsByPath: Record<string, TagLinkDetailDto[]>;
    entityId?: string;
    entityType: string;
}

function isArrayOfObjects(val: any): boolean {
    return Array.isArray(val) && val.length > 0 && typeof val[0] === "object" && val[0] !== null;
}

function renderNode(
    key: string,
    value: any,
    search: string,
    currentPath: string,
    ctx: RenderContext
): React.ReactNode {
    // Build next path
    const nodePath = currentPath ? (key ? `${currentPath}.${key}` : currentPath) : key;

    // 1. Nếu là Array of Objects -> Render Sub-Table với phân rã cấp bậc
    if (isArrayOfObjects(value)) {
        return (
            <ArrayOfObjectsTable
                key={nodePath || "root-array"}
                tableKey={key}
                basePath={nodePath}
                items={value}
                search={search}
                ctx={ctx}
            />
        );
    }

    // 2. Nếu là Array các kiểu primitive
    if (Array.isArray(value)) {
        if (value.length === 0) return null; // Ẩn mảng rỗng để tránh rác giao diện

        return (
            <div
                key={nodePath || "array-item"}
                className="p-2.5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/10 transition-colors"
            >
                <span className="font-mono font-medium text-foreground">{key}:</span>
                <div className="flex flex-wrap gap-1.5 items-center">
                    {value.map((item, idx) => {
                        const itemPath = `${nodePath}[${idx}]`;
                        const existingTags = ctx.tagsByPath[itemPath] || [];
                        return (
                            <TagDroppableCell
                                key={itemPath}
                                path={itemPath}
                                value={item}
                                entityId={ctx.entityId}
                                entityType={ctx.entityType}
                                existingTags={existingTags}
                                renderValueContent={(val) => (
                                    <Badge variant="secondary" className="font-mono text-[11px]">
                                        {String(val)}
                                    </Badge>
                                )}
                            />
                        );
                    })}
                </div>
            </div>
        );
    }

    // 3. Nếu là Object lồng nhau -> Sắp xếp thông minh và Render Collapsible Section
    if (typeof value === "object" && value !== null) {
        const rawEntries = Object.entries(value).filter(([_, v]) => {
            if (v === null || v === undefined) return false;
            if (Array.isArray(v) && v.length === 0) return false;
            return true;
        });

        // Sắp xếp ưu tiên: Array of Objects lên ĐẦU TIÊN (như objects, main_objects), sau đó đến Objects con, rồi đến primitives
        const sortedEntries = [...rawEntries].sort(([, v1], [, v2]) => {
            const isTable1 = isArrayOfObjects(v1);
            const isTable2 = isArrayOfObjects(v2);
            if (isTable1 && !isTable2) return -1;
            if (!isTable1 && isTable2) return 1;

            const isObj1 = typeof v1 === "object" && v1 !== null && !Array.isArray(v1);
            const isObj2 = typeof v2 === "object" && v2 !== null && !Array.isArray(v2);
            if (isObj1 && !isObj2) return -1;
            if (!isObj1 && isObj2) return 1;

            return 0;
        });

        const filteredEntries = search
            ? sortedEntries.filter(
                  ([k, v]) =>
                      k.toLowerCase().includes(search.toLowerCase()) ||
                      JSON.stringify(v).toLowerCase().includes(search.toLowerCase())
              )
            : sortedEntries;

        if (filteredEntries.length === 0 && search) return null;

        return (
            <Collapsible key={nodePath || "root-obj"} defaultExpanded className="w-full">
                <div className="flex items-center p-2.5 bg-muted/20 hover:bg-muted/40 transition-colors">
                    <CollapsibleTrigger className="p-1 rounded hover:bg-muted mr-1.5 flex items-center justify-center [&[aria-expanded=true]_.chevron]:rotate-90 [&[data-expanded=true]_.chevron]:rotate-90 cursor-pointer">
                        <ChevronRight className="h-3.5 w-3.5 chevron transition-transform duration-200 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <div className="flex items-center gap-2 flex-1 font-semibold text-xs">
                        <Braces className="w-3.5 h-3.5 text-primary" />
                        <span>{key || "Inspection Data"}</span>
                        <span className="text-[10px] text-muted-foreground font-normal">
                            ({sortedEntries.length} fields)
                        </span>
                    </div>
                </div>

                <CollapsibleContent>
                    <div className="pl-5 pr-2 pb-2 pt-1 border-t divide-y divide-border/60">
                        {filteredEntries.map(([childKey, childVal]) =>
                            renderNode(childKey, childVal, search, nodePath, ctx)
                        )}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        );
    }

    // 4. Primitive (Boolean, Number, String)
    const stringVal = String(value);
    if (
        search &&
        !key.toLowerCase().includes(search.toLowerCase()) &&
        !stringVal.toLowerCase().includes(search.toLowerCase())
    ) {
        return null;
    }

    const existingTags = getTagsForPath(nodePath, ctx.tagsByPath);

    return (
        <div
            key={nodePath}
            className="p-2 text-xs flex items-center justify-between gap-4 hover:bg-muted/10 transition-colors"
        >
            <span className="font-mono text-muted-foreground font-medium">{key}</span>
            <TagDroppableCell
                path={nodePath}
                value={value}
                entityId={ctx.entityId}
                entityType={ctx.entityType}
                existingTags={existingTags}
                renderValueContent={(val) => renderValueBadge(val)}
            />
        </div>
    );
}

function stripObjectPrefix(path: string): string {
    if (!path) return "";
    return path.replace(/^(?:objects\.[^.]+\.)?/, "");
}

function getTagsForPath(
    targetPath: string,
    tagsByPath: Record<string, TagLinkDetailDto[]>,
    fallbackPath: string = ""
): TagLinkDetailDto[] {
    // 1. Direct exact match
    if (tagsByPath[targetPath]?.length) {
        return tagsByPath[targetPath];
    }
    if (fallbackPath && tagsByPath[fallbackPath]?.length) {
        return tagsByPath[fallbackPath];
    }

    // 2. Semantic matching: Strip object namespace prefix (e.g. "objects.Genesis 9 Mouth Mesh.slots" -> "slots")
    // This ensures tags assigned on v1 remain visible on v2, v3, v4 even if Blender object name changed!
    const cleanTarget = stripObjectPrefix(targetPath);
    const cleanFallback = fallbackPath ? stripObjectPrefix(fallbackPath) : "";

    for (const [registeredPath, tags] of Object.entries(tagsByPath)) {
        if (!tags?.length) continue;
        const cleanReg = stripObjectPrefix(registeredPath);
        if (cleanReg === cleanTarget || (cleanFallback && cleanReg === cleanFallback)) {
            return tags;
        }
    }

    return [];
}

function renderValueBadge(value: any) {
    if (typeof value === "boolean") {
        return (
            <Badge
                variant={value ? "secondary" : "outline"}
                className={`font-mono text-[11px] px-2 py-0 ${
                    value ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground"
                }`}
            >
                {value ? "true" : "false"}
            </Badge>
        );
    }

    if (typeof value === "number") {
        return <span className="font-mono font-medium text-foreground">{value.toLocaleString()}</span>;
    }

    return <span className="font-mono text-foreground">{String(value)}</span>;
}

function renderCellContent(
    cellVal: any,
    cellPath: string,
    existingTags: TagLinkDetailDto[],
    ctx: RenderContext
): React.ReactNode {
    // 1. Null / undefined
    if (cellVal === null || cellVal === undefined) {
        return <span className="text-muted-foreground/50 italic text-[11px]">null</span>;
    }

    // 2. Mảng các primitives
    if (Array.isArray(cellVal)) {
        if (cellVal.length === 0) {
            return <span className="text-muted-foreground/50 italic text-[11px]">[]</span>;
        }
        return (
            <div className="flex flex-wrap gap-1 items-center">
                {cellVal.map((item: any, idx: number) => {
                    const itemPath = `${cellPath}[${idx}]`;
                    const itemTags = getTagsForPath(itemPath, ctx.tagsByPath);
                    return (
                        <TagDroppableCell
                            key={itemPath}
                            path={itemPath}
                            value={item}
                            entityId={ctx.entityId}
                            entityType={ctx.entityType}
                            existingTags={itemTags}
                            renderValueContent={(v) => (
                                <Badge variant="secondary" className="font-mono text-[10px]">
                                    {String(v)}
                                </Badge>
                            )}
                        />
                    );
                })}
            </div>
        );
    }

    // 3. Object nhỏ (như { width: 1920, height: 1080 } hoặc { min: 0, max: 1 })
    if (typeof cellVal === "object") {
        const entries = Object.entries(cellVal).filter(([_, v]) => v !== null && v !== undefined);
        if (entries.length === 0) {
            return <span className="text-muted-foreground/50 italic text-[11px]">{"{}"}</span>;
        }
        return (
            <div className="flex flex-wrap gap-1.5 items-center">
                {entries.map(([subK, subV]) => {
                    const subPath = `${cellPath}.${subK}`;
                    const subTags = getTagsForPath(subPath, ctx.tagsByPath);
                    return (
                        <TagDroppableCell
                            key={subPath}
                            path={subPath}
                            value={subV}
                            entityId={ctx.entityId}
                            entityType={ctx.entityType}
                            existingTags={subTags}
                            renderValueContent={(v) => (
                                <Badge
                                    variant="outline"
                                    className="font-mono text-[10px] gap-1 px-1.5 py-0 bg-background/50 border-border"
                                >
                                    <span className="text-muted-foreground">{subK}:</span>
                                    <span className="font-semibold text-foreground">{String(v)}</span>
                                </Badge>
                            )}
                        />
                    );
                })}
            </div>
        );
    }

    // 4. Primitive thông thường
    return (
        <TagDroppableCell
            path={cellPath}
            value={cellVal}
            entityId={ctx.entityId}
            entityType={ctx.entityType}
            existingTags={existingTags}
            renderValueContent={(val) => renderValueBadge(val)}
        />
    );
}

function ArrayOfObjectsTable({
    tableKey,
    basePath,
    items,
    search,
    ctx,
}: {
    tableKey: string;
    basePath: string;
    items: any[];
    search: string;
    ctx: RenderContext;
}) {
    // Phân loại cột: scalarCols (hiển thị trên các cột bảng) vs nestedCols (hiển thị trong dòng chi tiết mở rộng)
    const { scalarCols, nestedCols } = useMemo(() => {
        const scalarSet = new Set<string>();
        const nestedSet = new Set<string>();

        items.forEach((item) => {
            if (typeof item === "object" && item !== null) {
                Object.entries(item).forEach(([k, v]) => {
                    if (
                        isArrayOfObjects(v) ||
                        (typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length > 3)
                    ) {
                        nestedSet.add(k);
                    } else {
                        scalarSet.add(k);
                    }
                });
            }
        });

        return {
            scalarCols: Array.from(scalarSet),
            nestedCols: Array.from(nestedSet),
        };
    }, [items]);

    const hasNested = nestedCols.length > 0;

    const filteredItems = useMemo(() => {
        if (!search) return items;
        return items.filter((item) =>
            JSON.stringify(item).toLowerCase().includes(search.toLowerCase())
        );
    }, [items, search]);

    if (filteredItems.length === 0 && search) return null;

    return (
        <Collapsible defaultExpanded className="w-full">
            <div className="flex items-center justify-between p-2.5 bg-muted/30 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2 font-semibold text-xs text-foreground">
                    <CollapsibleTrigger className="p-1 rounded hover:bg-muted mr-1 flex items-center justify-center [&[aria-expanded=true]_.chevron]:rotate-90 [&[data-expanded=true]_.chevron]:rotate-90 cursor-pointer">
                        <ChevronRight className="h-3.5 w-3.5 chevron transition-transform duration-200 text-muted-foreground" />
                    </CollapsibleTrigger>
                    <Table2 className="w-3.5 h-3.5 text-primary" />
                    <span>{tableKey || "Items"}</span>
                    <Badge variant="secondary" className="text-[10px] font-normal py-0">
                        {items.length} items
                    </Badge>
                </div>
            </div>

            <CollapsibleContent>
                <div className="overflow-x-auto border-t bg-card">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b bg-muted/40 text-muted-foreground font-mono text-[11px]">
                                {hasNested && <th className="p-2 w-8" />}
                                {scalarCols.map((col) => (
                                    <th key={col} className="p-2 font-semibold uppercase tracking-wider">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-mono">
                            {filteredItems.map((row, rowIdx) => (
                                <ArrayOfObjectsTableRow
                                    key={`${basePath}[${rowIdx}]`}
                                    row={row}
                                    rowIdx={rowIdx}
                                    basePath={basePath}
                                    scalarCols={scalarCols}
                                    nestedCols={nestedCols}
                                    search={search}
                                    ctx={ctx}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

function getSemanticRowPath(basePath: string, row: any, rowIdx: number): string {
    if (typeof row === "object" && row !== null) {
        const identityKeys = ["name", "slot", "id", "key", "type", "label"];
        for (const k of identityKeys) {
            const val = row[k];
            if (val !== undefined && val !== null && String(val).trim().length > 0) {
                return `${basePath}[${k}='${String(val).trim()}']`;
            }
        }
    }
    return `${basePath}[${rowIdx}]`;
}

function ArrayOfObjectsTableRow({
    row,
    rowIdx,
    basePath,
    scalarCols,
    nestedCols,
    search,
    ctx,
}: {
    row: any;
    rowIdx: number;
    basePath: string;
    scalarCols: string[];
    nestedCols: string[];
    search: string;
    ctx: RenderContext;
}) {
    const [isExpanded, setIsExpanded] = useState(true);
    const rowPath = getSemanticRowPath(basePath, row, rowIdx);
    const legacyRowPath = `${basePath}[${rowIdx}]`;
    const hasNested = nestedCols.length > 0;
    const hasActiveNestedData = nestedCols.some((k) => {
        const v = row[k];
        return v && (Array.isArray(v) ? v.length > 0 : typeof v === "object");
    });

    return (
        <>
            <tr
                className={cn(
                    "hover:bg-muted/15 transition-colors",
                    hasActiveNestedData && "cursor-pointer"
                )}
                onClick={() => hasActiveNestedData && setIsExpanded((prev) => !prev)}
            >
                {hasNested && (
                    <td className="p-2 w-8 text-center" onClick={(e) => e.stopPropagation()}>
                        {hasActiveNestedData && (
                            <button
                                type="button"
                                onClick={() => setIsExpanded((prev) => !prev)}
                                className="p-1 rounded hover:bg-muted/60 transition-transform cursor-pointer text-muted-foreground hover:text-foreground"
                            >
                                <ChevronRight
                                    className={cn(
                                        "h-3.5 w-3.5 transition-transform duration-200",
                                        isExpanded && "rotate-90"
                                    )}
                                />
                            </button>
                        )}
                    </td>
                )}
                {scalarCols.map((col) => {
                    const cellVal = row[col];
                    const cellPath = `${rowPath}.${col}`;
                    const legacyCellPath = `${legacyRowPath}.${col}`;
                    const existingTags = getTagsForPath(cellPath, ctx.tagsByPath, legacyCellPath);

                    return (
                        <td
                            key={col}
                            className="p-2 align-middle"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {renderCellContent(cellVal, cellPath, existingTags, ctx)}
                        </td>
                    );
                })}
            </tr>

            {hasActiveNestedData && isExpanded && (
                <tr className="bg-muted/5 border-b">
                    <td colSpan={(hasNested ? 1 : 0) + scalarCols.length} className="p-2 pl-6">
                        <div className="space-y-2 border-l-2 border-primary/30 pl-3">
                            {nestedCols.map((nestedKey) => {
                                const nestedVal = row[nestedKey];
                                if (!nestedVal || (Array.isArray(nestedVal) && nestedVal.length === 0))
                                    return null;

                                return renderNode(nestedKey, nestedVal, search, rowPath, ctx);
                            })}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}
