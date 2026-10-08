import { useState, useRef, useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  CheckCircle,
  Maximize2,
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  ShieldCheck,
  Loader2,
  History,
  Zap,
  RefreshCw,
  Pencil,
  Download,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useUpdatePipelineMutation } from "../../hooks/usePipelines";
import { usePipelineExport } from "../../hooks/usePipelineExportImport";

interface CanvasToolbarProps {
  projectId: string;
  pipelineId?: string;
  pipelineName: string;
  triggerType?: number | string;
  isSaving: boolean;
  onOpenRunModal: () => void;
  onOpenHistory?: () => void;
  onValidate: () => void;
  isValidating?: boolean;
}

export function CanvasToolbar({
  projectId,
  pipelineId,
  pipelineName,
  triggerType,
  isSaving,
  onOpenRunModal,
  onOpenHistory,
  onValidate,
  isValidating,
}: CanvasToolbarProps) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const updateMutation = useUpdatePipelineMutation(projectId, pipelineId);
  const { exportSingle, isExportingSingle } = usePipelineExport();

  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(pipelineName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTempName(pipelineName);
  }, [pipelineName]);

  useEffect(() => {
    if (isEditingName) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditingName]);

  const handleSaveName = () => {
    const trimmed = tempName.trim();
    if (!trimmed || trimmed === pipelineName || !pipelineId) {
      setIsEditingName(false);
      setTempName(pipelineName);
      return;
    }
    updateMutation.mutate(
      { id: pipelineId, data: { name: trimmed } },
      {
        onSettled: () => {
          setIsEditingName(false);
        },
      }
    );
  };

  const renderTriggerBadge = () => {
    if (triggerType === 1 || triggerType === "OnResourceCreated") {
      return (
        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 gap-1 text-[10px] font-medium">
          <Zap className="h-3 w-3 fill-primary/20" />
          <span>On Resource Created</span>
        </Badge>
      );
    }
    if (triggerType === 2 || triggerType === "OnResourceVersionUpdated") {
      return (
        <Badge variant="outline" className="bg-sky-500/10 text-sky-500 border-sky-500/20 gap-1 text-[10px] font-medium">
          <RefreshCw className="h-3 w-3" />
          <span>On Version Updated</span>
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1 text-[10px] font-medium text-muted-foreground">
        <Play className="h-3 w-3" />
        <span>Manual Run</span>
      </Badge>
    );
  };

  return (
    <div className="flex h-14 w-full items-center justify-between border-b border-border/80 bg-background px-4 shadow-sm z-30">
      {/* Left: Back & Title */}
      <div className="flex items-center gap-3 min-w-0">
        <Link
          to="/projects/$projectId/pipeline"
          params={{ projectId }}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "h-8 w-8 text-muted-foreground")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="flex items-center gap-2 min-w-0">
          {isEditingName ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                  if (e.key === "Escape") {
                    setIsEditingName(false);
                    setTempName(pipelineName);
                  }
                }}
                onBlur={handleSaveName}
                disabled={updateMutation.isPending}
                className="h-7 rounded-md border border-primary/50 bg-background px-2 text-sm font-semibold text-foreground shadow-sm outline-none focus:ring-1 focus:ring-primary w-44 md:w-64"
              />
              {updateMutation.isPending && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
              )}
            </div>
          ) : (
            <div
              className="group/title flex items-center gap-1.5 cursor-pointer rounded-md px-1.5 py-0.5 hover:bg-muted/60 transition-colors"
              onClick={() => setIsEditingName(true)}
              title="Click to rename pipeline"
            >
              <h1 className="text-sm font-semibold text-foreground truncate max-w-xs md:max-w-md">
                {pipelineName}
              </h1>
              <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0" />
            </div>
          )}
          {renderTriggerBadge()}
        </div>

        {/* Live Auto-save Cloud Indicator */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] text-muted-foreground bg-muted/40 border border-border/40">
          {isSaving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              <span>Saved</span>
            </>
          )}
        </div>
      </div>

      {/* Right: Canvas Actions & Run */}
      <div className="flex items-center gap-2">
        {/* Zoom & Fit View */}
        <div className="hidden md:flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/40">
          <Button variant="ghost" size="icon" className="h-7 w-7" onPress={() => zoomIn()}>
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onPress={() => zoomOut()}>
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onPress={() => fitView({ padding: 0.2 })}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* History / Executions Drawer Trigger */}
        {onOpenHistory && (
          <Button
            variant="outline"
            size="sm"
            onPress={onOpenHistory}
            className="h-8 text-xs gap-1.5"
          >
            <History className="h-3.5 w-3.5 text-primary" />
            <span className="hidden sm:inline">Executions</span>
          </Button>
        )}

        {/* Export Pipeline Package */}
        <Button
          variant="outline"
          size="sm"
          onPress={() => {
            if (pipelineId) {
              exportSingle({ id: pipelineId });
            }
          }}
          isDisabled={!pipelineId || isExportingSingle}
          className="h-8 text-xs gap-1.5"
        >
          {isExportingSingle ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="hidden sm:inline">Export</span>
        </Button>

        {/* Validate */}
        <Button
          variant="outline"
          size="sm"
          onPress={onValidate}
          isDisabled={isValidating}
          className="h-8 text-xs gap-1.5"
        >
          {isValidating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          )}
          <span className="hidden sm:inline">Validate</span>
        </Button>

        {/* Run Pipeline Button */}
        <Button size="sm" onPress={onOpenRunModal} className="h-8 text-xs gap-1.5 shadow-sm">
          <Play className="h-3.5 w-3.5 fill-current" />
          <span>Run Pipeline</span>
        </Button>
      </div>
    </div>
  );
}
