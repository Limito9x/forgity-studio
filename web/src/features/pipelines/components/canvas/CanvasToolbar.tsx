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
  ShieldAlert,
  AlertTriangle,
  Loader2,
  History,
  Zap,
  RefreshCw,
  Pencil,
  Download,
  LocateFixed,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useReactFlow } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { useUpdatePipelineMutation } from "../../hooks/usePipelines";
import { usePipelineExport } from "../../hooks/usePipelineExportImport";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import type { ValidationStatus } from "../../form-scope/PipelineFormScope";

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
  validationStatus?: ValidationStatus;
  errorCount?: number;
  warningCount?: number;
  isStale?: boolean;
  isDiagnosticsPanelOpen?: boolean;
  onToggleDiagnosticsPanel?: () => void;
  isExecuting?: boolean;
  isAutoFollow?: boolean;
  onToggleAutoFollow?: () => void;
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
  errorCount = 0,
  warningCount = 0,
  isStale = false,
  isDiagnosticsPanelOpen = false,
  onToggleDiagnosticsPanel,
  isExecuting = false,
  isAutoFollow = true,
  onToggleAutoFollow,
}: CanvasToolbarProps) {
  const { studioSlug } = useCurrentStudio();
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

  const isManual =
    triggerType === 0 ||
    triggerType === "Manual" ||
    triggerType === undefined ||
    triggerType === null;

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
          to="/s/$studioSlug/projects/$projectId/pipeline"
          params={{ studioSlug, projectId }}
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
                className="h-8 rounded-md border border-input bg-background px-2.5 py-1 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                disabled={updateMutation.isPending}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onPress={handleSaveName}
                isDisabled={updateMutation.isPending}
              >
                Save
              </Button>
            </div>
          ) : (
            <div className="group flex items-center gap-2 min-w-0">
              <h1 className="text-sm font-semibold tracking-tight text-foreground truncate max-w-[200px] md:max-w-[320px]">
                {pipelineName}
              </h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
                onPress={() => setIsEditingName(true)}
                aria-label="Edit pipeline name"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
          )}

          {renderTriggerBadge()}

          {/* Autosave Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 pl-2 text-xs text-muted-foreground">
            {isSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                <span className="text-[11px]">Saving...</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-3 w-3 text-emerald-500" />
                <span className="text-[11px] text-muted-foreground/80">Saved</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Controls & Actions */}
      <div className="flex items-center gap-2">
        {/* Auto-Follow Camera Toggle during Live Execution */}
        {isExecuting && onToggleAutoFollow && (
          <span title={isAutoFollow ? "Auto-focusing active node" : "Camera auto-follow disabled"}>
            <Button
              variant={isAutoFollow ? "secondary" : "outline"}
              size="sm"
              onPress={onToggleAutoFollow}
              className={cn(
                "h-8 text-xs gap-1.5 transition-colors",
                isAutoFollow
                  ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                  : "text-muted-foreground"
              )}
            >
              <LocateFixed className={cn("h-3.5 w-3.5", isAutoFollow && "animate-pulse")} />
              <span className="hidden sm:inline">Follow</span>
            </Button>
          </span>
        )}

        {/* Viewport Controls */}
        <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/60">
          <div className="flex items-center">
            <span title="Zoom In">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onPress={() => zoomIn()}
                aria-label="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </span>
            <span title="Zoom Out">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onPress={() => zoomOut()}
                aria-label="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </span>
            <span title="Fit View">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onPress={() => fitView({ padding: 0.2, duration: 400 })}
                aria-label="Fit View"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </span>
          </div>
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

        {/* Validate Button with Diagnostic Badge */}
        <div className="flex items-center">
          <Button
            variant="outline"
            size="sm"
            onPress={onValidate}
            isDisabled={isValidating || isExecuting}
            className={cn(
              "h-8 text-xs gap-1.5",
              errorCount > 0
                ? "border-destructive/50 text-destructive hover:bg-destructive/10"
                : warningCount > 0
                  ? "border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                  : ""
            )}
          >
            {isValidating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : errorCount > 0 ? (
              <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
            ) : warningCount > 0 ? (
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            )}
            <span className="hidden sm:inline">Validate</span>

            {/* Badges */}
            {errorCount > 0 && (
              <Badge variant="destructive" className="h-4 px-1 py-0 text-[9px] font-mono">
                {errorCount}
              </Badge>
            )}
            {errorCount === 0 && warningCount > 0 && (
              <Badge
                variant="outline"
                className="h-4 px-1 py-0 text-[9px] font-mono border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10"
              >
                {warningCount}
              </Badge>
            )}
            {isStale && (
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" title="Draft changed" />
            )}
          </Button>

          {/* Toggle Diagnostics Panel Button */}
          {onToggleDiagnosticsPanel && (
            <span title="Open Diagnostics List">
              <Button
                variant={isDiagnosticsPanelOpen ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-6 ml-0.5 px-0 text-muted-foreground hover:text-foreground"
                onPress={onToggleDiagnosticsPanel}
                aria-label="Toggle diagnostics list"
              >
                <span className="text-[10px] font-mono">▼</span>
              </Button>
            </span>
          )}
        </div>

        {/* Run Pipeline Button */}
        {isManual ? (
          <Button
            size="sm"
            onPress={onOpenRunModal}
            isDisabled={isExecuting}
            className="h-8 text-xs gap-1.5 shadow-sm"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                <span className="text-amber-500 font-medium">Running...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Run Pipeline</span>
              </>
            )}
          </Button>
        ) : (
          <div
            title={`This pipeline is configured for automated trigger (${
              triggerType === 1 || triggerType === "OnResourceCreated"
                ? "On Resource Created"
                : "On Version Updated"
            }) and cannot be triggered manually.`}
            className="inline-block"
          >
            <Button size="sm" isDisabled className="h-8 text-xs gap-1.5 opacity-60">
              <Play className="h-3.5 w-3.5 fill-current opacity-40" />
              <span>Automated</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
