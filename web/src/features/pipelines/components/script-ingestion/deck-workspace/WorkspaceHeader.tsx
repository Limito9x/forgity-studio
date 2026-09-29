import { FileCode, Box, Sparkles, Cpu, RotateCcw, CheckCircle2, AlertTriangle, Network, Code2, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnalyzedCustomNodeDto } from "@/gen/model";

export type IngestionActiveTab = "pins" | "code" | "impact";

interface WorkspaceHeaderProps {
  node: AnalyzedCustomNodeDto;
  activeTab: IngestionActiveTab;
  onTabChange: (tab: IngestionActiveTab) => void;
}

export function WorkspaceHeader({
  node,
  activeTab,
  onTabChange,
}: WorkspaceHeaderProps) {
  const getExecutorIcon = (executor: string) => {
    switch (executor?.toLowerCase()) {
      case "blender":
        return <Box className="size-3.5 text-orange-500" />;
      case "unreal":
        return <Sparkles className="size-3.5 text-blue-500" />;
      default:
        return <Cpu className="size-3.5 text-emerald-500" />;
    }
  };

  const affectedEdges = node.impactReport?.affectedEdgeCount ?? 0;
  const isOverride = node.isOverride;

  const tabs: {
    key: IngestionActiveTab;
    label: string;
    icon: typeof Network;
    badge?: React.ReactNode;
  }[] = [
    {
      key: "pins",
      label: "Pins & Specification",
      icon: Network,
      badge: (
        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted font-mono text-muted-foreground group-data-[active=true]:bg-primary/10 group-data-[active=true]:text-primary">
          {node.inputs?.length ?? 0} in / {node.outputs?.length ?? 0} out
        </span>
      ),
    },
    {
      key: "code",
      label: "Python Source Code",
      icon: Code2,
    },
    {
      key: "impact",
      label: "Impact & Reconciliation",
      icon: ShieldAlert,
      badge:
        affectedEdges > 0 ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-destructive/15 text-destructive font-mono font-semibold flex items-center gap-1 animate-pulse">
            <AlertTriangle className="size-2.5" />
            {affectedEdges} wires
          </span>
        ) : isOverride ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono">
            Safe
          </span>
        ) : undefined,
    },
  ];

  return (
    <div className="border-b border-border bg-card/40 px-6 py-3.5 space-y-3 shrink-0">
      {/* Top Title & Metadata Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 shadow-inner">
            <FileCode className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold tracking-tight">
                {node.suggestedLabel || node.fileName}
              </h2>
              {isOverride ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 gap-1 text-[10px] font-semibold"
                >
                  <RotateCcw className="size-2.5" />
                  Modify Existing Node
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 gap-1 text-[10px] font-semibold"
                >
                  <CheckCircle2 className="size-2.5" />
                  New Node
                </Badge>
              )}

              <Badge variant="secondary" className="gap-1 font-mono text-[10px] uppercase">
                {getExecutorIcon(node.executor)}
                {node.executor}
              </Badge>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground font-mono mt-0.5">
              <span>File: <strong className="text-foreground font-medium">{node.fileName}</strong></span>
              <span>•</span>
              <span>Key: <strong className="text-foreground font-medium">{node.key}</strong></span>
              <span>•</span>
              <span>Hash: <strong className="text-muted-foreground">{node.contentHash?.substring(0, 10)}...</strong></span>
            </div>
          </div>
        </div>

        {/* Modern Segmented Pill Tabs */}
        <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border/60 gap-1">
          {tabs.map(({ key, label, icon: Icon, badge }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                data-active={isActive}
                onClick={() => onTabChange(key)}
                className={cn(
                  "group flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg transition-all select-none",
                  isActive
                    ? "bg-background text-foreground font-semibold shadow-xs border border-border/50"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                )}
              >
                <Icon className={cn("size-3.5", isActive ? "text-primary" : "text-muted-foreground")} />
                <span>{label}</span>
                {badge}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
