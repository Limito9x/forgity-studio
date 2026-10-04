import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  type ColumnDef,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DraggableResourceRowHandle } from "../components/DraggableResourceRowHandle";
import { useAssignResourcesContent } from "./useRepositories";
import type { WorkspaceResourceDto } from "@/gen/model";
import {
  FileCode,
  Tag,
  Folder,
  Sparkles,
  Unlink,
  GitBranch,
  Eye,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";

export interface UseRepositoryResourceTableOptions {
  data: WorkspaceResourceDto[];
  totalCount: number;
  projectId: string;
  repositoryId: string;
  onOpenAssignPanel: (resourceId?: string) => void;
}

export function useRepositoryResourceTable({
  data,
  totalCount,
  projectId,
  repositoryId,
  onOpenAssignPanel,
}: UseRepositoryResourceTableOptions) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const assignMutation = useAssignResourcesContent(repositoryId);

  const selectedRowIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const handleUnlink = (resourceId: string, displayName: string) => {
    assignMutation.mutate(
      {
        data: {
          resourceIds: [resourceId],
          contentId: null,
        },
      },
      {
        onSuccess: () => {
          toast.success(`Unlinked "${displayName || "resource"}" successfully.`);
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to unlink resource.");
        },
      }
    );
  };

  const handleBatchUnlink = () => {
    if (selectedRowIds.length === 0) return;

    assignMutation.mutate(
      {
        data: {
          resourceIds: selectedRowIds,
          contentId: null,
        },
      },
      {
        onSuccess: () => {
          toast.success(`Unlinked ${selectedRowIds.length} resource(s).`);
          setRowSelection({});
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to unlink resources.");
        },
      }
    );
  };

  const columns = useMemo<ColumnDef<WorkspaceResourceDto>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex items-center justify-center pl-1">
            <Checkbox
              slot="selection"
              isSelected={table.getIsAllPageRowsSelected()}
              isIndeterminate={table.getIsSomePageRowsSelected()}
              onChange={(checked) => table.toggleAllPageRowsSelected(checked)}
              aria-label="Select all resources"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center pl-1">
            <Checkbox
              slot="selection"
              isSelected={row.getIsSelected()}
              onChange={(checked) => row.toggleSelected(checked)}
              aria-label={`Select resource ${row.original.displayName || row.original.name}`}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 38,
      },
      {
        id: "dragHandle",
        header: () => null,
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <DraggableResourceRowHandle
              resource={row.original}
              selectedIds={selectedRowIds}
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        accessorKey: "name",
        header: "Resource File",
        meta: { label: "Name", icon: FileCode },
        cell: ({ row }) => {
          const item = row.original;

          return (
            <div className="flex items-center gap-2.5 py-1 min-w-[200px]">
              <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
                <FileCode className="size-4" />
              </div>
              <div className="min-w-0">
                <Link
                  to="/projects/$projectId/resources/$resourceId"
                  params={{ projectId: projectId || "", resourceId: item.id }}
                  search={{ workspaceId: repositoryId }}
                  className="font-semibold text-foreground hover:text-primary transition-colors text-sm truncate block group"
                >
                  <span className="group-hover:underline">{item.displayName || item.name || "Unnamed Resource"}</span>
                </Link>
                {item.relativePath && (
                  <p className="text-xs text-muted-foreground truncate max-w-xs font-mono text-[11px]">
                    {item.relativePath}
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "contentTypeName",
        header: "Content Type",
        meta: { label: "Type", icon: Tag },
        cell: ({ row }) => {
          const item = row.original;
          if (!item.contentTypeName) {
            return <span className="text-xs text-muted-foreground italic">Unassigned</span>;
          }
          return (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
              style={{
                backgroundColor: item.contentTypeColor ? `${item.contentTypeColor}15` : undefined,
                color: item.contentTypeColor || undefined,
                borderColor: item.contentTypeColor ? `${item.contentTypeColor}40` : undefined,
              }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: item.contentTypeColor || "#64748b" }}
              />
              {item.contentTypeName}
            </span>
          );
        },
      },
      {
        accessorKey: "contentName",
        header: "Linked Content",
        meta: { label: "Content", icon: Folder },
        cell: ({ row }) => {
          const item = row.original;
          if (!item.contentName) {
            return (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRowSelection({ [item.id]: true });
                  onOpenAssignPanel(item.id);
                }}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-primary gap-1 cursor-pointer"
              >
                <Sparkles className="size-3" />
                Assign
              </Button>
            );
          }
          return (
            <div className="flex items-center justify-between gap-2 max-w-[200px]">
              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground truncate">
                <Folder className="size-3.5 text-muted-foreground shrink-0" />
                <span className="truncate">{item.contentName}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleUnlink(item.id, item.displayName || item.name || "")}
                className="size-6 p-0 text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
                title="Unlink content"
              >
                <Unlink className="size-3" />
              </Button>
            </div>
          );
        },
      },
      {
        accessorKey: "versionCount",
        header: "Versions",
        meta: { label: "Versions", icon: GitBranch },
        cell: ({ row }) => {
          const item = row.original;
          const count = item.versionCount;

          return (
            <Link
              to="/projects/$projectId/resources/$resourceId"
              params={{ projectId: projectId || "", resourceId: item.id }}
              search={{ workspaceId: repositoryId }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted hover:bg-primary/15 hover:text-primary text-xs font-mono font-medium text-foreground transition-colors"
            >
              <GitBranch className="size-3 text-muted-foreground" />
              v{count && count > 0 ? count : 1}
            </Link>
          );
        },
      },
      {
        id: "actions",
        header: "Detail & Metadata",
        meta: { label: "Detail", icon: Eye },
        cell: ({ row }) => {
          const item = row.original;

          return (
            <Link
              to="/projects/$projectId/resources/$resourceId"
              params={{ projectId: projectId || "", resourceId: item.id }}
              search={{ workspaceId: repositoryId }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground transition-all"
            >
              <Eye className="size-3.5" />
              <span>Detail & Metadata</span>
            </Link>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created At",
        meta: { label: "Created", icon: Calendar },
        cell: ({ row }) => {
          const date = row.original.createdAt ? new Date(row.original.createdAt) : null;
          return (
            <span className="text-xs text-muted-foreground">
              {date ? date.toLocaleDateString() : "N/A"}
            </span>
          );
        },
      },
    ],
    [selectedRowIds, onOpenAssignPanel, projectId, repositoryId]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    rowCount: totalCount,
    getRowId: (row) => row.id,
    state: {
      rowSelection,
    },
    onRowSelectionChange: setRowSelection,
  });

  return {
    table,
    columns,
    selectedRowIds,
    setRowSelection,
    handleUnlink,
    handleBatchUnlink,
    assignMutation,
  };
}
