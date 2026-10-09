import { Link, useNavigate } from "@tanstack/react-router";
import {
  Workflow,
  Archive,
  MoreVertical,
  ExternalLink,
  Download,
  Pencil,
  Boxes,
  Layers,
  Calendar,
  ArrowRight,
  RotateCcw,
  Trash2,
  Zap,
  Play,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Menu,
  MenuItem,
  MenuTrigger,
  Popover,
} from "react-aria-components";
import { cn } from "@/lib/utils";
import type { PipelineSummaryDto } from "@/gen/model";
import { useDialogStore } from "@/stores/dialogStore";

interface PipelineCardProps {
  pipeline: PipelineSummaryDto;
  mode: "active" | "trash";
  projectId: string;
  onExportSingle?: (id: string) => void;
  onRestore?: (pipeline: PipelineSummaryDto) => void;
  isRestoring?: boolean;
}

export function PipelineCard({
  pipeline: p,
  mode,
  projectId,
  onExportSingle,
  onRestore,
  isRestoring,
}: PipelineCardProps) {
  const navigate = useNavigate();
  const openDialog = useDialogStore((state) => state.openDialog);

  const getTriggerBadge = (type?: number | string) => {
    if (type === 1 || type === "OnResourceCreated") {
      return (
        <Badge
          variant="outline"
          className="bg-primary/10 text-primary border-primary/20 gap-1 text-[10px] font-medium px-2 py-0.5"
        >
          <Zap className="h-3 w-3 fill-primary/20" />
          <span>On Resource Created</span>
        </Badge>
      );
    }
    if (type === 2 || type === "OnResourceVersionUpdated") {
      return (
        <Badge
          variant="outline"
          className="bg-sky-500/10 text-sky-500 border-sky-500/20 gap-1 text-[10px] font-medium px-2 py-0.5"
        >
          <RefreshCw className="h-3 w-3" />
          <span>On Version Updated</span>
        </Badge>
      );
    }
    return (
      <Badge
        variant="secondary"
        className="gap-1 text-[10px] font-medium text-muted-foreground px-2 py-0.5"
      >
        <Play className="h-3 w-3" />
        <span>Manual Run</span>
      </Badge>
    );
  };

  return (
    <Card
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden border-border/80 bg-card/60 backdrop-blur-sm transition-all duration-200",
        mode === "active"
          ? "hover:border-primary/50 hover:shadow-md"
          : "opacity-90 hover:border-border"
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-inner transition-transform duration-200",
                mode === "active"
                  ? "bg-primary/10 text-primary group-hover:scale-105"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {mode === "active" ? (
                <Workflow className="h-5 w-5" />
              ) : (
                <Archive className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle
                className={cn(
                  "text-sm font-semibold truncate leading-tight transition-colors",
                  mode === "active" && "group-hover:text-primary"
                )}
              >
                {p.name}
              </CardTitle>
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                {mode === "trash" ? (
                  <Badge
                    variant="outline"
                    className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px] font-medium px-2 py-0.5 gap-1"
                  >
                    <Archive className="h-3 w-3" />
                    <span>Archived</span>
                  </Badge>
                ) : (
                  getTriggerBadge((p as any).triggerType)
                )}
              </div>
            </div>
          </div>

          {/* Actions Menu (Active mode only) */}
          {mode === "active" && (
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
                  {onExportSingle && (
                    <MenuItem
                      onAction={() => onExportSingle(p.id)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Export Package</span>
                    </MenuItem>
                  )}
                  <MenuItem
                    onAction={() =>
                      openDialog("rename-pipeline", { pipeline: p })
                    }
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none hover:bg-accent hover:text-accent-foreground cursor-pointer"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span>Rename Pipeline</span>
                  </MenuItem>
                  <MenuItem
                    onAction={() =>
                      openDialog("archive-pipeline", { pipeline: p })
                    }
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-destructive outline-none hover:bg-destructive/10 cursor-pointer"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    <span>Move to Trash</span>
                  </MenuItem>
                </Menu>
              </Popover>
            </MenuTrigger>
          )}
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
            {p.deletedAt
              ? `Archived ${new Date(p.deletedAt).toLocaleDateString()}`
              : new Date(p.createdAt).toLocaleDateString()}
          </span>

          {mode === "active" ? (
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
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 px-2.5 font-medium"
                onPress={() => onRestore?.(p)}
                isDisabled={isRestoring}
              >
                <RotateCcw className="h-3 w-3 text-primary" />
                <span>Restore</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 px-2 font-medium text-destructive hover:bg-destructive/10 hover:text-destructive"
                onPress={() => openDialog("purge-pipeline", { pipeline: p })}
              >
                <Trash2 className="h-3 w-3" />
                <span>Delete</span>
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
