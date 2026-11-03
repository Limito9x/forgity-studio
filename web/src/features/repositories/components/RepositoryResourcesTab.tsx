import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Cpu,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { RepositoryDetailDto } from "../hooks/useRepositories";
import type { WorkspaceResourceDto } from "@/gen/model";
import { RepositoryResourceTable } from "./RepositoryResourceTable";

interface RepositoryResourcesTabProps {
  projectId: string;
  repositoryId: string;
  repository: RepositoryDetailDto;
  resources: WorkspaceResourceDto[];
  totalCount?: number;
  isLoading: boolean;
  onNavigateToSync: () => void;
  onNavigateToRunners: () => void;
  assignmentFilter?: "all" | "assigned" | "unassigned";
  onAssignmentFilterChange?: (filter: "all" | "assigned" | "unassigned") => void;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  search?: string;
  onSearchChange?: (search: string) => void;
  selectedRunnerFilter?: string;
  onRunnerFilterChange?: (runnerId: string) => void;
}

export function RepositoryResourcesTab({
  projectId,
  repositoryId,
  repository,
  resources,
  totalCount,
  isLoading,
  onNavigateToSync,
  onNavigateToRunners,
  assignmentFilter,
  onAssignmentFilterChange,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  search,
  onSearchChange,
  selectedRunnerFilter,
  onRunnerFilterChange,
}: RepositoryResourcesTabProps) {
  const runners = repository.runners || [];
  const effectiveTotalCount = totalCount ?? resources.length;
  const isFiltering = Boolean(search?.trim()) || assignmentFilter !== "all" || (selectedRunnerFilter && selectedRunnerFilter !== "ALL");

  return (
    <div className="space-y-4">
      {/* Main Content Area */}
      {isLoading ? (
        <Card className="rounded-2xl border-border/60 bg-card p-12">
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span>Loading resources...</span>
          </div>
        </Card>
      ) : resources.length === 0 && !isFiltering ? (
        <Card className="rounded-2xl border-border/60 bg-card">
          <CardContent className="p-0">
            <div className="text-center py-20 px-4 space-y-3">
              <FileText className="size-10 text-muted-foreground mx-auto stroke-1" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  No resources discovered yet
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {runners.length > 0
                    ? "Your compute runner is attached. Go to the Changes & Sync tab to scan and synchronize files."
                    : "Attach a local runner to scan and synchronize files into this repository."}
                </p>
              </div>
              <div className="pt-1">
                {runners.length > 0 ? (
                  <Button
                    size="sm"
                    onClick={onNavigateToSync}
                    className="gap-1.5 cursor-pointer text-xs"
                  >
                    <RefreshCw className="size-3.5" /> Go to Changes & Sync
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={onNavigateToRunners}
                    className="gap-1.5 cursor-pointer text-xs"
                  >
                    <Cpu className="size-3.5" /> Attach Runner in Runners Tab
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <RepositoryResourceTable
          data={resources}
          totalCount={effectiveTotalCount}
          isLoading={isLoading}
          projectId={projectId}
          repositoryId={repositoryId}
          runners={runners}
          assignmentFilter={assignmentFilter}
          onAssignmentFilterChange={onAssignmentFilterChange}
          page={page}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          search={search}
          onSearchChange={onSearchChange}
          selectedRunnerFilter={selectedRunnerFilter}
          onRunnerFilterChange={onRunnerFilterChange}
        />
      )}
    </div>
  );
}
