import { CheckCircle2, AlertCircle, Loader2, FileText, ArrowLeft, Copy, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExecutionStatusBannerProps {
  executionId: string;
  isRunning: boolean;
  isFailed: boolean;
  isSucceeded: boolean;
  errorMessage?: string | null;
  onOpenLogs: () => void;
  onExitView: () => void;
}

export function ExecutionStatusBanner({
  executionId,
  isRunning,
  isFailed,
  isSucceeded,
  errorMessage,
  onOpenLogs,
  onExitView,
}: ExecutionStatusBannerProps) {
  const shortId = executionId.slice(0, 8);

  const copyId = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(executionId);
    toast.success(`Copied execution ID: ${shortId}`);
  };

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-3 py-1.5 rounded-full border shadow-lg backdrop-blur-md bg-background/95 border-border/80 text-xs transition-all animate-in fade-in slide-in-from-top-2">
      <Badge
        variant="outline"
        className={cn(
          "text-[11px] gap-1.5 font-medium px-2 py-0.5",
          isRunning && "border-amber-500/50 bg-amber-500/10 text-amber-500 animate-pulse",
          isFailed && "border-destructive/50 bg-destructive/10 text-destructive",
          isSucceeded && "border-emerald-500/50 bg-emerald-500/10 text-emerald-500",
          !isRunning && !isFailed && !isSucceeded && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        {isRunning ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Live Tracking</span>
          </>
        ) : isFailed ? (
          <>
            <AlertCircle className="h-3 w-3" />
            <span>Execution Failed</span>
          </>
        ) : isSucceeded ? (
          <>
            <CheckCircle2 className="h-3 w-3" />
            <span>Execution Succeeded</span>
          </>
        ) : (
          <>
            <Eye className="h-3 w-3" />
            <span>Execution View</span>
          </>
        )}
      </Badge>

      <button
        onClick={copyId}
        type="button"
        title="Click to copy full ID"
        className="font-mono text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 hover:underline cursor-pointer transition-colors"
      >
        #{shortId}
        <Copy className="h-2.5 w-2.5 opacity-60" />
      </button>

      {errorMessage && (
        <span
          className="max-w-[200px] sm:max-w-[300px] truncate text-destructive text-[11px] font-medium"
          title={errorMessage}
        >
          • {errorMessage}
        </span>
      )}

      <div className="h-3.5 w-px bg-border/80 mx-0.5" />

      <Button
        variant="ghost"
        size="sm"
        onPress={onOpenLogs}
        className="h-6 px-2 text-xs gap-1 hover:bg-muted"
      >
        <FileText className="h-3 w-3 text-primary" />
        <span>Logs</span>
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onPress={onExitView}
        className="h-6 px-2 text-xs gap-1 font-medium bg-muted/80 hover:bg-muted text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        <span>Back to Draft</span>
      </Button>
    </div>
  );
}
