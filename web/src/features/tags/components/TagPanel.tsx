import { useState, useMemo } from "react";
import { useTagTree, useDeleteTag, type TagTreeNodeDto } from "../hooks/useTags";
import { useProjectToolbarStore } from "@/stores/projectToolbarStore";
import { useDialogStore } from "@/stores/dialogStore";
import "@/features/tags/dialogs";
import {
    Tag,
    X,
    Search,
    Plus,
    Folder,
    FolderOpen,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    GripVertical,
    Trash2,
    Sparkles,
    Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDraggable } from "@dnd-kit/core";
import type { DraggableTagPayload } from "../types";
import { toast } from "sonner";

interface TagPanelProps {
    projectId: string;
    contextTitle?: string;
}

export function TagPanel({ projectId, contextTitle }: TagPanelProps) {
    const closePanel = useProjectToolbarStore((s) => s.closePanel);
    const isCollapsed = useProjectToolbarStore((s) => s.isCollapsed);
    const toggleCollapse = useProjectToolbarStore((s) => s.toggleCollapse);
    const openDialog = useDialogStore((s) => s.openDialog);

    const isMinimized = isCollapsed;

    const { data: treeData, isLoading } = useTagTree(
        { projectId },
        { enabled: Boolean(projectId) }
    );

    const tree = treeData ?? [];
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

    const toggleExpand = (path: string) => {
        setExpandedPaths((prev) => {
            const next = new Set(prev);
            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }
            return next;
        });
    };

    // Filter tree by search query recursively
    const filteredTree = useMemo(() => {
        if (!searchQuery.trim()) return tree;

        const query = searchQuery.toLowerCase();

        function filterNodes(nodes: TagTreeNodeDto[]): TagTreeNodeDto[] {
            const result: TagTreeNodeDto[] = [];

            for (const node of nodes) {
                const matchesSelf =
                    node.name.toLowerCase().includes(query) ||
                    node.path.toLowerCase().includes(query);

                const filteredChildren = filterNodes(node.children || []);

                if (matchesSelf || filteredChildren.length > 0) {
                    result.push({
                        ...node,
                        children: filteredChildren,
                    });
                }
            }

            return result;
        }

        return filterNodes(tree);
    }, [tree, searchQuery]);

    // Count total leaf tags
    const totalTagsCount = useMemo(() => {
        let count = 0;
        function countNodes(nodes: TagTreeNodeDto[]) {
            for (const node of nodes) {
                count++;
                if (node.children?.length) countNodes(node.children);
            }
        }
        countNodes(tree);
        return count;
    }, [tree]);

    return (
        <aside
            aria-label="GameplayTags Explorer"
            className={cn(
                "fixed right-12 top-16 bottom-4 w-80 md:w-96 z-40 bg-card/95 backdrop-blur-2xl border border-border/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300 ease-in-out",
                isMinimized
                    ? "h-14 max-h-14 border-primary/40 shadow-lg"
                    : "h-auto max-h-[calc(100vh-5rem)]"
            )}
        >
            {/* Header */}
            <div className="px-4 py-2.5 border-b border-border/70 flex items-center justify-between gap-2 bg-muted/20 shrink-0 h-14">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                        <Tag className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                                GAMEPLAY TAGS
                            </span>
                            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-mono">
                                {totalTagsCount}
                            </Badge>
                        </div>
                        {contextTitle && (
                            <span className="text-[10px] text-muted-foreground truncate block">
                                {contextTitle}
                            </span>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1 ml-auto">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 rounded-lg text-xs gap-1"
                        onClick={() =>
                            openDialog("bulk-create-tag", {
                                projectId,
                            })
                        }
                        aria-label="Bulk Create Tags"
                    >
                        <Layers className="w-3.5 h-3.5" />
                        Bulk
                    </Button>
                    <Button
                        size="icon"
                        variant="default"
                        className="h-7 w-7 rounded-lg shadow-xs"
                        onClick={() =>
                            openDialog("create-tag", {
                                projectId,
                            })
                        }
                        aria-label="Create New Tag"
                    >
                        <Plus className="w-3.5 h-3.5" />
                    </Button>

                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                        onClick={toggleCollapse}
                        aria-label={isCollapsed ? "Expand panel" : "Collapse panel"}
                    >
                        {isCollapsed ? (
                            <ChevronUp className="w-4 h-4" />
                        ) : (
                            <ChevronDown className="w-4 h-4" />
                        )}
                    </Button>

                    <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive"
                        onClick={closePanel}
                        aria-label="Close panel"
                    >
                        <X className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Search and Hint Bar (only when not minimized) */}
            {!isMinimized && (
                <div className="p-3 border-b border-border/60 flex flex-col gap-2 shrink-0 bg-muted/5">
                    <div className="relative w-full">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Filter by path (e.g. Character.Hero)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8 text-xs bg-card"
                        />
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground px-1">
                        <Sparkles className="w-3 h-3 text-primary shrink-0" />
                        <span>Drag any tag directly into the metadata cells</span>
                    </div>
                </div>
            )}

            {/* Scrollable Tree View */}
            {!isMinimized && (
                <div className="flex-1 overflow-y-auto p-2.5 space-y-1">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs gap-2">
                            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            <span>Loading GameplayTags...</span>
                        </div>
                    ) : filteredTree.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 text-center p-4 border border-dashed border-border/70 rounded-xl">
                            <Tag className="w-8 h-8 text-muted-foreground/40 mb-2" />
                            <p className="text-xs font-semibold text-foreground">
                                {searchQuery ? "No tags match your search" : "No GameplayTags created yet"}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1 max-w-[200px]">
                                {searchQuery
                                    ? "Try typing a different path prefix."
                                    : "Click '+ New' to create hierarchical tags like Asset.Character.Hero."}
                            </p>
                            {!searchQuery && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-3 text-xs h-7 gap-1"
                                    onClick={() => openDialog("create-tag", { projectId })}
                                >
                                    <Plus className="w-3 h-3" />
                                    <span>Create Tag</span>
                                </Button>
                            )}
                        </div>
                    ) : (
                        filteredTree.map((node) => (
                            <TagTreeNodeItem
                                key={node.id}
                                node={node}
                                projectId={projectId}
                                expandedPaths={expandedPaths}
                                toggleExpand={toggleExpand}
                                autoExpandAll={Boolean(searchQuery.trim())}
                            />
                        ))
                    )}
                </div>
            )}
        </aside>
    );
}

interface TagTreeNodeItemProps {
    node: TagTreeNodeDto;
    projectId: string;
    level?: number;
    expandedPaths: Set<string>;
    toggleExpand: (path: string) => void;
    autoExpandAll?: boolean;
}

function TagTreeNodeItem({
    node,
    projectId,
    level = 0,
    expandedPaths,
    toggleExpand,
    autoExpandAll = false,
}: TagTreeNodeItemProps) {
    const openDialog = useDialogStore((s) => s.openDialog);
    const deleteTag = useDeleteTag();

    const hasChildren = Boolean(node.children && node.children.length > 0);
    const isExpanded = autoExpandAll || expandedPaths.has(node.path);

    // Draggable hook for drag-and-drop
    const payload: DraggableTagPayload = {
        type: "tag",
        projectId,
        tagId: node.id,
        tagPath: node.path,
        tagName: node.name,
        tagColor: node.color,
        tagDescription: node.description,
    };

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `tag-${node.path}`,
        data: payload,
    });

    const tagColor = node.color || "#3b82f6";

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (confirm(`Delete tag '${node.path}' and its child tags?`)) {
            deleteTag.mutate(
                { id: node.id, data: { deleteChildren: true } },
                {
                    onSuccess: () => toast.success(`Tag '${node.name}' deleted`),
                    onError: () => toast.error("Failed to delete tag"),
                }
            );
        }
    };

    const handleAddChild = (e: React.MouseEvent) => {
        e.stopPropagation();
        openDialog("create-tag", {
            projectId,
            parentPath: node.path,
        });
    };

    const handleBulkAddChild = (e: React.MouseEvent) => {
        e.stopPropagation();
        openDialog("bulk-create-tag", {
            projectId,
            parentPath: node.path,
        });
    };

    return (
        <div className="flex flex-col select-none">
            {/* Node Row */}
            <div
                ref={setNodeRef}
                className={cn(
                    "group relative flex items-center gap-1 py-1 px-1.5 rounded-lg text-xs transition-colors hover:bg-muted/60",
                    isDragging && "opacity-30 border border-dashed border-primary/50 bg-primary/5"
                )}
                style={{ paddingLeft: `${level * 14 + 6}px` }}
            >
                {/* Expand/Collapse Chevron or spacer */}
                {hasChildren ? (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(node.path);
                        }}
                        className="w-4 h-4 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 cursor-pointer"
                    >
                        {isExpanded ? (
                            <ChevronDown className="w-3 h-3" />
                        ) : (
                            <ChevronRight className="w-3 h-3" />
                        )}
                    </button>
                ) : (
                    <div className="w-4 h-4 shrink-0" />
                )}

                {/* Draggable Main Area (Grip, Icon, Name) */}
                <div
                    {...listeners}
                    {...attributes}
                    className="flex items-center gap-1.5 min-w-0 flex-1 cursor-grab active:cursor-grabbing p-0.5 rounded"
                    title="Drag tag to assign or click to toggle"
                    onClick={() => {
                        if (hasChildren) {
                            toggleExpand(node.path);
                        }
                    }}
                >
                    {/* Drag Grip Handle */}
                    <div
                        className="p-0.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0"
                    >
                        <GripVertical className="w-3.5 h-3.5" />
                    </div>

                    {/* Folder or Tag Icon */}
                    {hasChildren ? (
                        isExpanded ? (
                            <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        ) : (
                            <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )
                    ) : (
                        <div
                            className="w-2 h-2 rounded-full shrink-0 shadow-2xs"
                            style={{ backgroundColor: tagColor }}
                        />
                    )}

                    {/* Node Name & Path */}
                    <span className="font-medium text-foreground truncate">{node.name}</span>
                    {level > 0 && (
                        <span className="text-[10px] text-muted-foreground/50 truncate font-mono hidden sm:inline">
                            .{node.name}
                        </span>
                    )}
                </div>

                {/* Hover Quick Actions */}
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity ml-auto shrink-0">
                    <button
                        type="button"
                        onClick={handleBulkAddChild}
                        title={`Bulk add under ${node.path}`}
                        className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                        <Layers className="w-3 h-3" />
                    </button>
                    <button
                        type="button"
                        onClick={handleAddChild}
                        title={`Add child tag to ${node.path}`}
                        className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                        <Plus className="w-3 h-3" />
                    </button>

                    <button
                        type="button"
                        onClick={handleDelete}
                        title={`Delete ${node.path}`}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Render Children Recursively */}
            {hasChildren && isExpanded && (
                <div className="relative border-l border-border/40 ml-3.5 pl-0.5 space-y-0.5 mt-0.5">
                    {node.children.map((child) => (
                        <TagTreeNodeItem
                            key={child.id}
                            node={child}
                            projectId={projectId}
                            level={level + 1}
                            expandedPaths={expandedPaths}
                            toggleExpand={toggleExpand}
                            autoExpandAll={autoExpandAll}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
