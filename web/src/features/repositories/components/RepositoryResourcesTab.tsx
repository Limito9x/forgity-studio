import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  Cpu,
  HardDrive,
  Calendar,
  Search,
  Loader2,
  RefreshCw,
} from "lucide-react";
import type { RepositoryDetailDto } from "../hooks/useRepositories";

interface ResourceItemLike {
  id: string;
  displayName?: string | null;
  relativePath?: string | null;
  versionCount?: number;
  createdAt: string;
}

interface RepositoryResourcesTabProps {
  projectId: string;
  repositoryId: string;
  repository: RepositoryDetailDto;
  resources: ResourceItemLike[];
  isLoading: boolean;
  onNavigateToSync: () => void;
  onNavigateToRunners: () => void;
}

export function RepositoryResourcesTab({
  projectId,
  repositoryId,
  repository,
  resources,
  isLoading,
  onNavigateToSync,
  onNavigateToRunners,
}: RepositoryResourcesTabProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const runners = repository.runners || [];
  const primaryRunner = runners[0];

  const filteredResources = useMemo(() => {
    if (!search.trim()) return resources;
    const q = search.toLowerCase();
    return resources.filter(
      (r) =>
        (r.displayName && r.displayName.toLowerCase().includes(q)) ||
        (r.relativePath && r.relativePath.toLowerCase().includes(q))
    );
  }, [resources, search]);

  return (
    <div className="space-y-4">
      {/* Compact Metric Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-0.5">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
            <FileText className="size-3 text-primary" /> Total Resources
          </span>
          <p className="text-xl font-bold font-mono text-foreground">{resources.length}</p>
        </div>

        <div className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-0.5">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
            <Cpu className="size-3 text-emerald-500" /> Active Runners
          </span>
          <p className="text-xl font-bold font-mono text-foreground">{runners.length}</p>
        </div>

        <div className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-0.5 min-w-0">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
            <HardDrive className="size-3 text-primary" /> Primary Mount
          </span>
          <p className="text-xs font-mono text-foreground truncate mt-1" title={primaryRunner?.rootPath || "None"}>
            {primaryRunner?.rootPath || "No mount path"}
          </p>
        </div>

        <div className="p-3 rounded-xl border border-border/60 bg-card/60 space-y-0.5">
          <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
            <Calendar className="size-3 text-muted-foreground" /> Created Date
          </span>
          <p className="text-xs font-medium text-foreground mt-1">
            {new Date(repository.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Resources Browser Card */}
      <Card className="rounded-2xl border-border/60 bg-card">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between border-b px-6 py-3.5 gap-3">
          <div>
            <CardTitle className="text-base font-semibold">Repository Resources</CardTitle>
            <CardDescription className="text-xs">
              Files and assets mapped from your attached compute runner
            </CardDescription>
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter resources..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/20"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-xs">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Loading resources...</span>
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="text-center py-20 px-4 space-y-3">
              <FileText className="size-10 text-muted-foreground mx-auto stroke-1" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {search ? "No resources matching search" : "No resources discovered yet"}
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {search
                    ? "Try clearing your search query to see all indexed repository files."
                    : runners.length > 0
                    ? "Your compute runner is attached. Go to the Changes & Sync tab to scan and synchronize files."
                    : "Attach a local runner to scan and synchronize files into this repository."}
                </p>
              </div>
              {!search && (
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
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/60 max-h-[520px] overflow-y-auto">
              {filteredResources.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors text-xs gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="size-4 text-primary/70 shrink-0" />
                    <div className="min-w-0">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() =>
                          navigate({
                            to: "/projects/$projectId/resources/$resourceId",
                            params: { projectId, resourceId: item.id },
                            search: { workspaceId: repositoryId },
                          })
                        }
                        className="p-0 h-auto font-medium text-foreground hover:text-primary transition-colors truncate text-left cursor-pointer justify-start"
                      >
                        {item.displayName}
                      </Button>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">
                        {item.relativePath}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-muted-foreground text-[11px]">
                    {item.versionCount !== undefined && <span>Versions: {item.versionCount}</span>}
                    <span>•</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
