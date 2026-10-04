import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  FileText,
  Clock,
  HardDrive,
  Cpu,
  Calendar,
  Layers,
  Loader2,
  FolderGit2,
  Boxes,
  History,
  RefreshCw,
} from "lucide-react";
import {
  useResourceDetail,
  type ResourceVersionDto,
  type ResourceVersionLocationDto,
} from "../hooks/useRepositories";
import { ResourceTagDropZone } from "../components/ResourceTagDropZone";
import { ResourceMetadataTab } from "../components/ResourceMetadataTab";
import { TagTool } from "@/features/tags/components/TagTool";
import { cn } from "@/lib/utils";

interface ResourceDetailPageProps {
  projectId: string;
  workspaceId?: string;
  resourceId: string;
}

function formatBytes(bytes?: number, decimals = 2): string {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function ResourceDetailPage({
  projectId,
  workspaceId,
  resourceId,
}: ResourceDetailPageProps) {
  const navigate = useNavigate();
  const { data: resource, isLoading, isError, refetch } = useResourceDetail(resourceId);

  const [activeTab, setActiveTab] = useState<"metadata" | "versions">("metadata");

  const versions: ResourceVersionDto[] = (resource?.versions || []) as ResourceVersionDto[];
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");

  const latestVersion = versions[0];
  const currentActiveVersionId = selectedVersionId || latestVersion?.id || "";
  const fileExtension = resource?.name ? resource.name.split(".").pop() : "";

  return (
    <div className="p-6 space-y-6 w-full min-w-0">
      {/* TagTool on the right dock for dragging tags */}
      <TagTool projectId={projectId} contextTitle={resource?.name || "Resource Detail"} />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="outline"
            size="icon"
            className="size-9 rounded-xl cursor-pointer shrink-0"
            onClick={() => {
              if (workspaceId) {
                navigate({
                  to: "/projects/$projectId/repositories/$repositoryId",
                  params: { projectId, repositoryId: workspaceId },
                });
              } else {
                navigate({
                  to: "/projects/$projectId/repositories",
                  params: { projectId },
                });
              }
            }}
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </Button>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2 truncate">
                <FileText className="size-6 text-primary shrink-0" />
                <span className="truncate">{resource?.name || "Resource Detail"}</span>
              </h1>
              {fileExtension && (
                <Badge variant="secondary" className="uppercase font-mono text-[10px]">
                  .{fileExtension}
                </Badge>
              )}
              {versions.length > 0 && (
                <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px]">
                  v{latestVersion?.versionNo ?? 1} Latest
                </Badge>
              )}
              <ResourceTagDropZone
                resourceId={resourceId}
                projectId={projectId}
                className="py-1 px-2.5 min-h-[30px] border-dashed"
              />
            </div>

            <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
              {resource?.filePath || `ID: ${resourceId}`}
            </p>
          </div>
        </div>

        {/* Tab Navigation in Header & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="flex items-center p-1 rounded-xl bg-muted/60 border">
            <button
              type="button"
              onClick={() => setActiveTab("metadata")}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                activeTab === "metadata"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Boxes className="size-3.5" />
              <span>Metadata & Tagging</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("versions")}
              className={cn(
                "inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                activeTab === "versions"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <History className="size-3.5" />
              <span>Version History ({versions.length})</span>
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5 cursor-pointer text-xs h-8"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </Button>

          {workspaceId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate({
                  to: "/projects/$projectId/repositories/$repositoryId",
                  params: { projectId, repositoryId: workspaceId },
                })
              }
              className="gap-1.5 cursor-pointer text-xs h-8"
            >
              <FolderGit2 className="size-3.5 text-primary" /> Repository
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-xs">Loading resource metadata and version history...</p>
        </div>
      ) : isError || !resource ? (
        <Card className="rounded-2xl border-destructive/40 bg-destructive/5 p-8 text-center">
          <FileText className="size-10 text-destructive mx-auto stroke-1 mb-2" />
          <p className="text-sm font-semibold text-foreground">Resource not found</p>
          <p className="text-xs text-muted-foreground mt-1">
            The requested resource could not be found or you may not have access to view it.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              navigate({
                to: "/projects/$projectId/repositories",
                params: { projectId },
              })
            }
            className="mt-4 text-xs cursor-pointer"
          >
            Back to Repositories
          </Button>
        </Card>
      ) : (
        <>
          {/* Quick Metrics (Clean & Focused, No Checksum clutters) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl border border-border/60 bg-card/60 space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                <HardDrive className="size-3 text-primary" /> Latest File Size
              </span>
              <p className="text-lg font-bold font-mono text-foreground">
                {latestVersion ? formatBytes(latestVersion.sizeBytes) : "0 B"}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border/60 bg-card/60 space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                <Layers className="size-3 text-emerald-500" /> Recorded Versions
              </span>
              <p className="text-lg font-bold font-mono text-foreground">
                {versions.length} {versions.length === 1 ? "revision" : "revisions"}
              </p>
            </div>

            <div className="p-3.5 rounded-xl border border-border/60 bg-card/60 space-y-1 min-w-0">
              <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1.5">
                <Cpu className="size-3 text-primary" /> Physical Runner Mounts
              </span>
              <p className="text-lg font-bold font-mono text-foreground">
                {latestVersion?.locations?.length ?? 0} {latestVersion?.locations?.length === 1 ? "machine" : "machines"}
              </p>
            </div>
          </div>

          {/* Main Tab Content */}
          {activeTab === "metadata" ? (
            <Card className="rounded-2xl border-border/60 bg-card p-6 shadow-xs">
              <ResourceMetadataTab
                versions={versions}
                selectedVersionId={currentActiveVersionId}
                onSelectVersionId={(verId) => setSelectedVersionId(verId)}
                projectId={projectId}
                workspaceId={workspaceId}
                resourceId={resourceId}
                resourceName={resource.name}
                filePath={resource.filePath || undefined}
              />
            </Card>
          ) : (
            <Card className="rounded-2xl border-border/60 bg-card shadow-xs">
              <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Clock className="size-4 text-primary" />
                    Version History & Locations
                  </CardTitle>
                  <CardDescription className="text-xs">
                    List of synchronized revisions and physical runner machine mount paths
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="font-mono text-xs">
                  {versions.length} {versions.length === 1 ? "Version" : "Versions"}
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                {versions.length === 0 ? (
                  <div className="text-center py-16 px-4 space-y-2">
                    <Clock className="size-8 text-muted-foreground mx-auto stroke-1" />
                    <p className="text-sm font-medium text-foreground">No versions recorded</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      This resource has not been synchronized through any attached runner.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {versions.map((ver, idx) => {
                      const isLatest = idx === 0;
                      const locations: ResourceVersionLocationDto[] =
                        (ver.locations || []) as ResourceVersionLocationDto[];

                      return (
                        <div key={ver.id} className="p-6 space-y-4 hover:bg-muted/10 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <Badge
                                variant={isLatest ? "default" : "outline"}
                                className="font-mono text-xs px-2.5 py-0.5"
                              >
                                v{ver.versionNo}
                              </Badge>
                              {isLatest && (
                                <Badge
                                  variant="outline"
                                  className="text-emerald-500 border-emerald-500/30 text-[10px]"
                                >
                                  Current Active
                                </Badge>
                              )}
                              <span className="font-mono text-xs font-semibold text-foreground">
                                {formatBytes(ver.sizeBytes)}
                              </span>
                              <span className="text-muted-foreground text-xs">•</span>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="size-3" />
                                <span>{new Date(ver.createdAt).toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          {ver.notes && (
                            <div className="text-xs bg-muted/30 border-l-2 border-primary/60 px-3 py-2 rounded-r-md text-muted-foreground italic">
                              "{ver.notes}"
                            </div>
                          )}

                          {/* Physical Locations on Runners */}
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                              <Cpu className="size-3.5 text-primary" />
                              <span>Physical Runner Mounts ({locations.length})</span>
                            </div>

                            {locations.length === 0 ? (
                              <div className="p-3 rounded-xl border border-dashed border-border/60 bg-muted/10 text-xs text-muted-foreground flex items-center gap-2">
                                <HardDrive className="size-4 text-muted-foreground" />
                                <span>No active runner locations registered for this version.</span>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {locations.map((loc) => (
                                  <div
                                    key={loc.id}
                                    className="p-3 rounded-xl border border-border/60 bg-card/80 space-y-2 text-xs"
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div className="size-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                          <Cpu className="size-3" />
                                        </div>
                                        <span className="font-semibold text-foreground truncate">
                                          {loc.runnerName || loc.machineKey || "Runner Machine"}
                                        </span>
                                      </div>
                                      {loc.isOrigin && (
                                        <Badge
                                          variant="outline"
                                          className="text-amber-500 border-amber-500/30 text-[10px] shrink-0"
                                        >
                                          Origin Host
                                        </Badge>
                                      )}
                                    </div>

                                    <div
                                      className="font-mono text-[11px] bg-muted/30 p-2 rounded-md border border-border/40 text-muted-foreground truncate"
                                      title={`${loc.rootPath || ""}/${loc.relativePath}`}
                                    >
                                      <span className="text-foreground">{loc.rootPath || "Mount"}</span>
                                      <span>/{loc.relativePath}</span>
                                    </div>

                                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5">
                                      <span>Discovered:</span>
                                      <span>{new Date(loc.discoveredAt).toLocaleString()}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
