import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  usePipelines,
  useCreatePipelineMutation,
  useUpdatePipelineMutation,
  useDeletePipelineMutation,
} from "../hooks/usePipelines";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Workflow,
  Plus,
  ArrowRight,
  Boxes,
  Calendar,
  Layers,
  FileCode,
  Loader2,
  MoreVertical,
  Trash2,
  ExternalLink,
  Zap,
  Play,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { cn } from "@/lib/utils";
import type { PipelineSummaryDto } from "@/gen/model";

interface PipelineListPageProps {
  projectId: string;
}

export function PipelineListPage({ projectId }: PipelineListPageProps) {
  const navigate = useNavigate();
  const { data: pipelines = [], isLoading } = usePipelines(projectId);
  const createMutation = useCreatePipelineMutation(projectId);
  const updateMutation = useUpdatePipelineMutation(projectId);
  const deleteMutation = useDeletePipelineMutation(projectId);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pipelineName, setPipelineName] = useState("");
  const [pipelineToDelete, setPipelineToDelete] = useState<PipelineSummaryDto | null>(null);
  const [pipelineToRename, setPipelineToRename] = useState<PipelineSummaryDto | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleOpenRename = (p: PipelineSummaryDto) => {
    setPipelineToRename(p);
    setRenameValue(p.name);
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipelineToRename || !renameValue.trim()) return;
    try {
      await updateMutation.mutateAsync({
        id: pipelineToRename.id,
        data: { name: renameValue.trim() },
      });
      setPipelineToRename(null);
    } catch {
      // Handled by toast
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipelineName.trim()) return;

    try {
      const created = await createMutation.mutateAsync({
        projectId,
        name: pipelineName.trim(),
      } as any);

      setIsCreateOpen(false);
      setPipelineName("");

      // Navigate straight into the canvas editor!
      if (created?.id) {
        navigate({
          to: "/projects/$projectId/pipeline/$pipelineId",
          params: { projectId, pipelineId: created.id },
        });
      }
    } catch {
      // Handled by toast
    }
  };

  const getTriggerBadge = (type?: number | string) => {
    if (type === 1 || type === "OnResourceCreated") {
      return (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1 text-[10px] font-medium px-2 py-0.5">
          <Zap className="h-3 w-3 fill-primary/20" />
          <span>On Resource Created</span>
        </Badge>
      );
    }
    if (type === 2 || type === "OnResourceVersionUpdated") {
      return (
        <Badge variant="outline" className="bg-sky-500/10 text-sky-500 border-sky-500/20 gap-1 text-[10px] font-medium px-2 py-0.5">
          <RefreshCw className="h-3 w-3" />
          <span>On Version Updated</span>
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1 text-[10px] font-medium text-muted-foreground px-2 py-0.5">
        <Play className="h-3 w-3" />
        <span>Manual Run</span>
      </Badge>
    );
  };

  const handleDelete = async () => {
    if (!pipelineToDelete) return;
    try {
      await deleteMutation.mutateAsync(pipelineToDelete.id);
      setPipelineToDelete(null);
    } catch {
      // Handled by toast
    }
  };

  return (
    <div className="p-6 mx-auto space-y-6 w-full min-w-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Workflow className="h-6 w-6 text-primary" />
            Pipelines
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/projects/$projectId/pipeline/nodes/new"
            params={{ projectId }}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 text-xs")}
          >
            <FileCode className="h-3.5 w-3.5" />
            <span>New Custom Node</span>
          </Link>

          <Button size="sm" onPress={() => setIsCreateOpen(true)} className="gap-1.5 text-xs shadow-sm">
            <Plus className="h-3.5 w-3.5" />
            <span>New Pipeline</span>
          </Button>
        </div>
      </div>

      {/* Pipeline Cards Grid */}
      <div className="space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            <Loader2 className="h-6 w-6 animate-spin mr-2 text-primary" />
            Loading pipelines...
          </div>
        ) : pipelines.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 p-12 text-center bg-card/40">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner mb-4">
              <Workflow className="h-7 w-7" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No pipelines created yet</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Create your first visual pipeline to orchestrate multi-step tasks across Blender, Unreal Engine, and background automation tasks.
            </p>
            <Button onPress={() => setIsCreateOpen(true)} size="sm" className="mt-5 gap-1.5 text-xs shadow-sm">
              <Plus className="h-3.5 w-3.5" />
              <span>Create Pipeline</span>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {pipelines.map((p) => (
              <Card
                key={p.id}
                className="group relative flex flex-col justify-between overflow-hidden border-border/80 bg-card/60 backdrop-blur-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105 shadow-inner">
                        <Workflow className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-sm font-semibold truncate leading-tight group-hover:text-primary transition-colors">
                          {p.name}
                        </CardTitle>
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          {getTriggerBadge((p as any).triggerType)}
                        </div>
                      </div>
                    </div>

                    {/* Actions dropdown */}
                    <MenuTrigger>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                      <Popover className="min-w-[150px] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg">
                        <Menu className="outline-none space-y-0.5 text-xs">
                          <MenuItem
                            onAction={() =>
                              navigate({
                                to: "/projects/$projectId/pipeline/$pipelineId",
                                params: { projectId, pipelineId: p.id },
                              })
                            }
                            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Open Canvas</span>
                          </MenuItem>
                          <MenuItem
                            onAction={() => handleOpenRename(p)}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            <span>Rename Pipeline</span>
                          </MenuItem>
                          <MenuItem
                            onAction={() => setPipelineToDelete(p)}
                            className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-destructive outline-none hover:bg-destructive/10 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete Pipeline</span>
                          </MenuItem>
                        </Menu>
                      </Popover>
                    </MenuTrigger>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-1">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{p.nodeCount} nodes</span>
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{p.edgeCount} connections</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/40">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>

                    <Link
                      to="/projects/$projectId/pipeline/$pipelineId"
                      params={{ projectId, pipelineId: p.id }}
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "sm" }),
                        "h-7 text-xs gap-1 group-hover:text-primary font-medium"
                      )}
                    >
                      <span>Open Canvas</span>
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Pipeline Dialog */}
      <Dialog isOpen={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <form onSubmit={handleCreate} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Workflow className="h-4 w-4 text-primary" />
              <span>Create New Pipeline</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Enter a unique name for your pipeline to open the visual DAG editor.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pname" className="text-xs font-semibold">Pipeline Name</Label>
              <Input
                id="pname"
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
                placeholder="e.g. Ingest FBX & Auto Inspect"
                autoFocus
                required
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onPress={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" isDisabled={!pipelineName.trim() || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create & Open Canvas"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>



      {/* Delete Pipeline Confirmation Dialog */}
      <Dialog
        isOpen={!!pipelineToDelete}
        onOpenChange={(open) => !open && setPipelineToDelete(null)}
      >
        <div className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-destructive">
              <Trash2 className="h-4 w-4" />
              <span>Delete Pipeline</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Are you sure you want to delete pipeline{" "}
              <strong className="text-foreground font-medium">"{pipelineToDelete?.name}"</strong>?
              This will permanently delete all nodes, edges, execution history, and linked configurations.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={() => setPipelineToDelete(null)}
              isDisabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onPress={handleDelete}
              isDisabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Pipeline"}
            </Button>
          </DialogFooter>
        </div>
      </Dialog>

      {/* Rename Pipeline Dialog */}
      <Dialog
        isOpen={!!pipelineToRename}
        onOpenChange={(open) => !open && setPipelineToRename(null)}
      >
        <form onSubmit={handleRename} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Pencil className="h-4 w-4 text-primary" />
              <span>Rename Pipeline</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Enter a new unique name for pipeline{" "}
              <strong className="text-foreground font-medium">"{pipelineToRename?.name}"</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="rename-pipeline-name" className="text-xs font-medium">
              Pipeline Name
            </Label>
            <Input
              id="rename-pipeline-name"
              placeholder="e.g., Export FBX Production"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onPress={() => setPipelineToRename(null)}
              isDisabled={updateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              isDisabled={!renameValue.trim() || renameValue.trim() === pipelineToRename?.name || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
