import { useNavigate } from "@tanstack/react-router";
import { useRepositoryDetail } from "../hooks/useRepositories";
import { useGetRepositoryResources } from "@/gen/endpoints/repositories/repositories";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ArrowLeft,
  FolderGit2,
  Cpu,
  FileText,
  Loader2,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";

interface RepositoryDetailPageProps {
  projectId: string;
  repositoryId: string;
}

export function RepositoryDetailPage({ projectId, repositoryId }: RepositoryDetailPageProps) {
  const navigate = useNavigate();
  const openDialog = useDialogStore((state) => state.openDialog);
  const { data: repository, isLoading, isError, error, refetch } = useRepositoryDetail(repositoryId);

  const { data: resourcesData, isLoading: isResourcesLoading } = useGetRepositoryResources(
    repositoryId,
    { projectId, workspaceId: repositoryId, page: 1, pageSize: 50 },
    { query: { enabled: !!repositoryId } }
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="size-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground font-medium">Loading repository details...</p>
      </div>
    );
  }

  if (isError || !repository) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center space-y-4">
        <div className="p-6 rounded-2xl border border-destructive/30 bg-destructive/5 text-destructive">
          <h3 className="font-semibold text-lg">Failed to load repository</h3>
          <p className="text-sm mt-1 text-muted-foreground">
            {(error as any)?.message || "The repository could not be found or you do not have permission to view it."}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate({ to: "/projects/$projectId/repositories", params: { projectId } })}
          className="gap-2"
        >
          <ArrowLeft className="size-4" /> Back to Repositories
        </Button>
      </div>
    );
  }

  const runners = repository.runners || [];
  const resources = resourcesData?.items || [];

  return (
    <div className="p-6 lg:p-8 space-y-6 w-full max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-xl cursor-pointer"
            onClick={() => navigate({ to: "/projects/$projectId/repositories", params: { projectId } })}
            aria-label="Back to repositories"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
                <FolderGit2 className="size-6 text-primary" />
                {repository.name}
              </h1>
              <Badge variant="outline" className="text-xs font-mono">
                {runners.length > 0 ? "Connected" : "No Runner"}
              </Badge>
            </div>
            {repository.description && (
              <p className="text-sm text-muted-foreground mt-0.5">{repository.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5 cursor-pointer text-xs"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() =>
              openDialog("update-repository", {
                id: repository.id,
                name: repository.name,
                description: repository.description || undefined,
                projectId: repository.projectId,
              })
            }
            className="gap-1.5 cursor-pointer text-xs"
          >
            Edit Repository
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Resources</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              <span>{resources.length}</span>
              <FileText className="size-5 text-primary/60" />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Synchronized assets & files
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Attached Runners</CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              <span>{runners.length}</span>
              <Cpu className="size-5 text-primary/60" />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Worker agents executing jobs
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/60 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs uppercase font-medium">Storage Location</CardDescription>
            <CardTitle className="text-base font-semibold truncate flex items-center justify-between">
              <span className="font-mono text-xs truncate max-w-[200px]">
                {runners[0]?.rootPath || "Cloud Managed"}
              </span>
              <HardDrive className="size-5 text-primary/60 shrink-0" />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground truncate">
            {runners[0]?.runner ? `Machine: ${runners[0].runner.machineKey}` : "No runner location bound"}
          </CardContent>
        </Card>
      </div>

      {/* Resources Table / List */}
      <Card className="rounded-2xl border-border/60 bg-card">
        <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
          <div>
            <CardTitle className="text-base font-semibold">Repository Resources</CardTitle>
            <CardDescription className="text-xs">
              Files and directory items mapped from local runner directories
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isResourcesLoading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-xs">
              <Loader2 className="size-4 animate-spin text-primary" />
              <span>Loading resources...</span>
            </div>
          ) : resources.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-2">
              <FileText className="size-8 text-muted-foreground mx-auto stroke-1" />
              <p className="text-sm font-medium text-foreground">No resources discovered yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Attach a local runner to scan and synchronize files into this repository.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {resources.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-6 py-3 hover:bg-muted/30 transition-colors text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="size-4 text-primary/70 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{item.displayName}</p>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">
                        {item.relativePath}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                    <span className="font-mono text-[11px]">
                      v{item.versionCount ?? 1}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {item.contentTypeName || "item"}
                    </Badge>
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
