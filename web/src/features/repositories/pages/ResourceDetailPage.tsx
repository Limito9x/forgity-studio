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
  Hash,
  Copy,
  Check,
  Calendar,
  Layers,
  Loader2,
  FolderGit2,
  Tag as TagIcon,
  RefreshCw,
} from "lucide-react";
import {
  useResourceDetail,
  type ResourceVersionDto,
  type ResourceVersionLocationDto,
} from "../hooks/useRepositories";
import { ResourceTagDropZone } from "../components/ResourceTagDropZone";
import { TagTool } from "@/features/tags/components/TagTool";
import { toast } from "sonner";

interface ResourceDetailPageProps {
  projectId: string;
  workspaceId?: string;
  resourceId: string;
}

function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
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

  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success("File checksum hash copied to clipboard");
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const versions: ResourceVersionDto[] = (resource?.versions || []) as ResourceVersionDto[];
  const latestVersion = versions[0];
  const fileExtension = resource?.name ? resource.name.split(".").pop() : "";

  return (
    <div className="p-6 space-y-6 w-full min-w-0">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
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
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5 truncate">
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
            </div>
            <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate">
              {resource?.filePath || `ID: ${resourceId}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5 cursor-pointer text-xs"
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
              className="gap-1.5 cursor-pointer text-xs"
            >
              <FolderGit2 className="size-3.5 text-primary" /> View Repository
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
          {/* Stats & Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="rounded-xl border-border/60">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">Latest File Size</CardDescription>
                <CardTitle className="text-2xl font-bold font-mono">
                  {latestVersion ? formatBytes(latestVersion.sizeBytes) : "0 B"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Current version footprint
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">Total Versions</CardDescription>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Layers className="size-5 text-primary" />
                  {versions.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Synchronized revisions
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">Physical Copies</CardDescription>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <HardDrive className="size-5 text-emerald-500" />
                  {latestVersion?.locations?.length ?? 0}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Runner machines hosting file
              </CardContent>
            </Card>

            <Card className="rounded-xl border-border/60">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">First Discovered</CardDescription>
                <CardTitle className="text-sm font-medium mt-1">
                  {new Date(resource.createdAt).toLocaleDateString()}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {new Date(resource.createdAt).toLocaleTimeString()}
              </CardContent>
            </Card>
          </div>

          {/* Quick Metadata & Tags Card */}
          <Card className="rounded-2xl border-border/60 bg-card">
            <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
              <div>
                <CardTitle className="text-base font-semibold">Resource Overview</CardTitle>
                <CardDescription className="text-xs">
                  Storage location and semantic categorizations
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1.5">
                  <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <FileText className="size-3.5 text-primary" /> Relative File Path
                  </span>
                  <p className="font-mono text-foreground font-semibold break-all text-xs bg-card px-2.5 py-1.5 rounded-md border border-border/40 select-all">
                    {resource.filePath || "Root level item"}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1.5">
                  <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Hash className="size-3.5 text-primary" /> Latest Checksum (SHA-256)
                  </span>
                  <div className="flex items-center gap-2">
                    <p className="font-mono text-foreground text-[11px] truncate flex-1 bg-card px-2.5 py-1.5 rounded-md border border-border/40 select-all">
                      {latestVersion?.fileHash || "No hash recorded"}
                    </p>
                    {latestVersion?.fileHash && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 cursor-pointer shrink-0"
                        onClick={() => handleCopyHash(latestVersion.fileHash)}
                        aria-label="Copy SHA-256 Hash"
                      >
                        {copiedHash === latestVersion.fileHash ? (
                          <Check className="size-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Tagging Zone */}
              <div className="p-3.5 rounded-xl border border-border/60 bg-muted/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                    <TagIcon className="size-3.5 text-primary" /> Semantic Resource Tags
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Drag tags from the right panel to tag this resource
                  </span>
                </div>
                <div>
                  <ResourceTagDropZone
                    resourceId={resourceId}
                    projectId={projectId}
                    className="w-full min-h-[38px] p-2 bg-card/60"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Version History & Physical Locations Section */}
          <Card className="rounded-2xl border-border/60 bg-card">
            <CardHeader className="flex flex-row items-center justify-between border-b px-6 py-4">
              <div>
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="size-4 text-primary" />
                  Version History & Locations
                </CardTitle>
                <CardDescription className="text-xs">
                  Immutable record of file states, sync memos, and distributed runner machine copies
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
                        {/* Version Main Header */}
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
                                Current Release
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

                          <div className="flex items-center gap-2">
                            <div
                              className="flex items-center gap-1.5 font-mono text-[11px] bg-muted/40 px-2.5 py-1 rounded-md border border-border/50 max-w-xs truncate"
                              title={ver.fileHash}
                            >
                              <Hash className="size-3 text-muted-foreground shrink-0" />
                              <span className="truncate">{ver.fileHash}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 cursor-pointer shrink-0"
                              onClick={() => handleCopyHash(ver.fileHash)}
                              aria-label="Copy Hash"
                            >
                              {copiedHash === ver.fileHash ? (
                                <Check className="size-3 text-emerald-500" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {/* Notes if present */}
                        {ver.notes && (
                          <div className="text-xs bg-muted/30 border-l-2 border-primary/60 px-3 py-2 rounded-r-md text-muted-foreground italic">
                            "{ver.notes}"
                          </div>
                        )}

                        {/* Physical Locations on Runners */}
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                            <Cpu className="size-3.5 text-primary" />
                            <span>Physical Runner Locations ({locations.length})</span>
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

                        {/* Semantic Sub-Path Tags if present */}
                        {ver.tagsByPath && Object.keys(ver.tagsByPath).length > 0 && (
                          <div className="space-y-1.5 pt-2">
                            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                              <TagIcon className="size-3" /> Sub-path Semantic Tags
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(ver.tagsByPath).map(([path, tags]) => (
                                <div
                                  key={path}
                                  className="flex items-center gap-1.5 bg-muted/40 px-2 py-1 rounded-md border text-[11px]"
                                >
                                  <span className="font-mono text-muted-foreground">{path}:</span>
                                  {tags.map((t) => (
                                    <Badge
                                      key={t.tagLinkId || t.tagId}
                                      variant="secondary"
                                      style={{
                                        backgroundColor: t.tagColor ? `${t.tagColor}20` : undefined,
                                        borderColor: t.tagColor || undefined,
                                        color: t.tagColor || undefined,
                                      }}
                                      className="text-[10px] px-1.5 py-0"
                                    >
                                      {t.tagName}
                                    </Badge>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Floating TagTool for easy drag-and-drop onto ResourceTagDropZone */}
      <TagTool projectId={projectId} />
    </div>
  );
}
