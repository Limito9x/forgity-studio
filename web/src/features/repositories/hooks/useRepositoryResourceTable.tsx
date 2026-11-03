import { useMemo, useState } from "react";

import { Link } from "@tanstack/react-router";

import {

  type ColumnDef,

  type SortingState,

  getCoreRowModel,

  getSortedRowModel,

  useReactTable,

} from "@tanstack/react-table";

import { Checkbox } from "@/components/ui/checkbox";

import { Button } from "@/components/ui/button";

import { Badge } from "@/components/ui/badge";

import { DraggableResourceRowHandle } from "../components/DraggableResourceRowHandle";

import { LinkedContentsCell } from "../components/LinkedContentsCell";

import { useAssignResourcesContent, useDeleteResource } from "./useRepositories";

import type { WorkspaceResourceDto } from "@/gen/model";

import {
  FileCode,
  Folder,
  GitBranch,
  Eye,
  Calendar,
  Lock,
  Trash2,
  Cpu,

} from "lucide-react";

import { toast } from "sonner";

import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";

import { useProjectNav } from "@/lib/navigation/useProjectNav";

import { useDialogStore } from "@/stores/dialogStore";

import { ResourceThumbnail } from "@/components/custom-ui/ResourceThumbnail";



export interface UseRepositoryResourceTableOptions {
  data: WorkspaceResourceDto[];
  totalCount: number;
  projectId: string;
  repositoryId: string;
  onOpenAssignPanel: (resourceId?: string) => void;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export function useRepositoryResourceTable({
  data,
  totalCount,
  projectId,
  repositoryId,
  onOpenAssignPanel,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: UseRepositoryResourceTableOptions) {

  const { studioSlug } = useCurrentStudio();

  const nav = useProjectNav({ studioSlug, projectId });

  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

  const [sorting, setSorting] = useState<SortingState>([]);



  const openDialog = useDialogStore((state) => state.openDialog);

  const assignMutation = useAssignResourcesContent(repositoryId);

  const deleteMutation = useDeleteResource(repositoryId);



  const selectedRowIds = useMemo(

    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),

    [rowSelection]

  );



  const handleDelete = (resourceId: string, displayName?: string) => {

    openDialog("delete-resource", {

      id: resourceId,

      name: displayName,

      repositoryId,

    });

  };



  const handleBatchDelete = () => {

    if (selectedRowIds.length === 0) return;

    openDialog("delete-resource", {

      ids: selectedRowIds,

      repositoryId,

      onSuccess: () => {

        setRowSelection({});

      },

    });

  };



  const handleUnlink = (
    resourceId: string,
    displayName: string,
    contentItemId?: string
  ) => {
    assignMutation.mutate(
      {
        data: {
          resourceIds: [resourceId],
          contentId: null,
          contentItemIdToUnlink: contentItemId || undefined,
        } as any,
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

              aria-label={`Select resource ${row.original.displayName}`}

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

        accessorKey: "displayName",

        header: "Resource File",

        meta: { label: "Name", icon: FileCode },

        cell: ({ row }) => {

          const item = row.original;



          return (

            <div className="flex items-center gap-2.5 py-1 min-w-[200px]">

              <ResourceThumbnail
                displayName={item.displayName}
                relativePath={item.relativePath}
                thumbnailUrl={item.thumbnailUrl}
                size="md"
              />

              <div className="min-w-0">

                <Link

                  to={nav.urls.resourceDetail(item.id, repositoryId)}

                  className="font-semibold text-foreground hover:text-primary transition-colors text-sm truncate block group"

                >

                  <span className="group-hover:underline">{item.displayName || "Unnamed Resource"}</span>

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
        id: "linkedContents",
        header: "Linked Contents",
        meta: { label: "Linked Contents", icon: Folder },
        cell: ({ row }) => {
          return (
            <LinkedContentsCell
              resource={row.original as any}
              onAssign={(id) => {
                setRowSelection({ [id]: true });
                onOpenAssignPanel(id);
              }}
              onUnlink={(id, contentItemId) =>
                handleUnlink(id, row.original.displayName || "", contentItemId)
              }
            />
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

          // latestVersionStatus: 0 = Draft, 1 = Published

          const isDraft =

            item.latestVersionStatus === 0 ||

            (item.latestVersionStatus as any) === "Draft" ||

            item.latestVersionStatus === undefined ||

            item.latestVersionStatus === null;



          const isSameRunnerLock =

            Boolean(item.isLocked) &&

            Boolean(item.holdingRunnerName) &&

            (!item.lockedByRunnerName || item.holdingRunnerName === item.lockedByRunnerName);



          return (

            <div className="flex items-center gap-1.5 flex-wrap">

              <Link

                to={nav.urls.resourceDetail(item.id, repositoryId)}

                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted hover:bg-primary/15 hover:text-primary text-xs font-mono font-medium text-foreground transition-colors shrink-0"

              >

                <GitBranch className="size-3 text-muted-foreground" />

                v{item.latestVersionNo ?? (count && count > 0 ? count : 1)}

              </Link>

              {isDraft ? (

                <Badge

                  variant="outline"

                  className="text-amber-500 border-amber-500/30 bg-amber-500/10 text-[10px] px-1.5 py-0 h-4 gap-1 font-medium font-mono max-w-[200px]"

                  title={

                    item.holdingRunnerName

                      ? `Draft on ${item.holdingRunnerName}${item.isLocked ? " (Locked)" : ""}`

                      : "Local Draft"

                  }

                >

                  {item.isLocked ? (

                    <Lock className="size-2.5 shrink-0" />

                  ) : (

                    <Cpu className="size-2.5 shrink-0" />

                  )}

                  <span>Draft</span>

                  {item.holdingRunnerName && (

                    <span className="truncate">

                      @ {item.holdingRunnerName}

                    </span>

                  )}

                </Badge>

              ) : (

                <Badge

                  variant="outline"

                  className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 text-[10px] px-1 py-0 h-4"

                >

                  Published

                </Badge>

              )}

              {item.isLocked && !isSameRunnerLock && (

                <Badge

                  variant="outline"

                  className="text-rose-500 border-rose-500/30 bg-rose-500/10 text-[10px] px-1 py-0 h-4 gap-0.5 font-mono max-w-[160px]"

                  title={item.lockedByRunnerName ? `Locked by ${item.lockedByRunnerName}` : "Locked by Runner"}

                >

                  <Lock className="size-2.5 shrink-0" />

                  <span className="truncate">

                    {item.lockedByRunnerName ? `Locked: ${item.lockedByRunnerName}` : "Locked"}

                  </span>

                </Badge>

              )}

            </div>

          );

        },

      },

      {

        id: "actions",

        header: "Actions",

        meta: { label: "Actions", icon: Eye },

        enableSorting: false,

        cell: ({ row }) => {

          const item = row.original;



          return (

            <div className="flex items-center gap-1.5">

              <Link

                to={nav.urls.resourceDetail(item.id, repositoryId)}

                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground transition-all"

              >

                <Eye className="size-3.5" />

                <span>Detail</span>

              </Link>

              <Button

                size="icon"

                variant="ghost"

                className="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"

                aria-label={`Remove "${item.displayName || "resource"}" from repository`}

                onClick={() => handleDelete(item.id, item.displayName)}

                isDisabled={deleteMutation.isPending}

              >

                <Trash2 className="size-3.5" />

              </Button>

            </div>

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

    [selectedRowIds, onOpenAssignPanel, projectId, repositoryId, nav.urls, deleteMutation.isPending]

  );



  const pageIndex = (page ?? 1) - 1;
  const currentPageSize = pageSize ?? 25;

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
    pageCount: currentPageSize > 0 ? Math.ceil(totalCount / currentPageSize) : -1,
    rowCount: totalCount,
    getRowId: (row) => row.id,
    state: {
      rowSelection,
      sorting,
      pagination: {
        pageIndex,
        pageSize: currentPageSize,
      },
    },
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onPaginationChange: (updater) => {
      const next =
        typeof updater === "function"
          ? updater({ pageIndex, pageSize: currentPageSize })
          : updater;
      if (next.pageIndex !== pageIndex) {
        onPageChange?.(next.pageIndex + 1);
      }
      if (next.pageSize !== currentPageSize) {
        onPageSizeChange?.(next.pageSize);
      }
    },
  });



  return {

    table,

    columns,

    selectedRowIds,

    setRowSelection,

    handleUnlink,

    handleBatchUnlink,

    handleDelete,

    handleBatchDelete,

    assignMutation,

    deleteMutation,

  };

}

