import { useState, useMemo } from "react";
import { getSoftwareMetadata } from "../constants/dccEngines";
import type { ExecutorCandidateDto } from "../types";
import type { RunnerExecutorConfigDto } from "../hooks/useRunners";
import { ExecutorIcon } from "./ExecutorIcon";
import { UnrealExecutorExtension } from "./ExecutorExtensions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FolderOpen,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  FolderKanban,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CompactExecutorRowProps {
  executorKey: string;
  runnerId?: string;
  runnerName?: string;
  availableCandidates: ExecutorCandidateDto[];
  activeConfig?: RunnerExecutorConfigDto;
  onOpenBrowse: (
    initialPath?: string,
    onSelect?: (selectedPath: string) => void
  ) => void;
  onSave: (payload: {
    executorKey: string;
    executablePath: string;
    version: string | null;
    isEnabled: boolean;
    settings: Record<string, any>;
  }) => void;
  isSaving?: boolean;
}

export function CompactExecutorRow({
  executorKey,
  runnerId,
  runnerName,
  availableCandidates,
  activeConfig,
  onOpenBrowse,
  onSave,
  isSaving = false,
}: CompactExecutorRowProps) {
  const meta = getSoftwareMetadata(executorKey);
  const [copied, setCopied] = useState(false);
  const [showUnrealProjects, setShowUnrealProjects] = useState(false);

  // Active or selected path
  const currentPath = activeConfig?.executablePath || "";
  const currentVersion = activeConfig?.version || "";
  const isConfigured = Boolean(currentPath.trim());

  // Candidates list
  const hasCandidates = availableCandidates.length > 0;

  // Selected candidate object (if current path matches one of discovered installations)
  const matchedCandidate = useMemo(() => {
    return availableCandidates.find(
      (c) => c.executablePath.toLowerCase() === currentPath.toLowerCase()
    );
  }, [availableCandidates, currentPath]);

  // Handle switching to another discovered candidate version
  const handleSelectCandidate = (candidate: ExecutorCandidateDto) => {
    onSave({
      executorKey,
      executablePath: candidate.executablePath,
      version: candidate.version || null,
      isEnabled: true,
      settings: (activeConfig?.settings as Record<string, any>) || {},
    });
  };

  // Handle manual browse selection
  const handleBrowse = () => {
    onOpenBrowse(currentPath, (selectedPath) => {
      // Auto-detect version if selected path matches any candidate
      const cand = availableCandidates.find(
        (c) => c.executablePath.toLowerCase() === selectedPath.toLowerCase()
      );
      onSave({
        executorKey,
        executablePath: selectedPath,
        version: cand?.version || currentVersion || null,
        isEnabled: true,
        settings: (activeConfig?.settings as Record<string, any>) || {},
      });
    });
  };

  const handleCopyPath = async () => {
    if (!currentPath) return;
    try {
      await navigator.clipboard.writeText(currentPath);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Path copied to clipboard");
    } catch {
      toast.error("Failed to copy path");
    }
  };

  const registeredProjects =
    (activeConfig?.settings as Record<string, any>)?.registeredProjects || {};
  const projectCount = Object.keys(registeredProjects).length;

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-200 bg-card/60 p-3.5 space-y-2.5",
        isConfigured
          ? "border-border/80 hover:border-border"
          : "border-dashed border-amber-500/40 bg-amber-500/5"
      )}
    >
      {/* Top Header: Icon + Name + Category + Status */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60 border border-border/50">
            <ExecutorIcon executor={executorKey} className="size-4.5" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-foreground truncate">
              {meta.name}
            </span>
            <Badge
              variant="secondary"
              className="text-[10px] h-4.5 px-1.5 font-medium text-muted-foreground uppercase tracking-wider"
            >
              {meta.category}
            </Badge>
          </div>
        </div>

        {/* Right Status Badge & Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isConfigured ? (
            <Badge
              variant="outline"
              className="h-5 px-2 gap-1 text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
            >
              <CheckCircle2 className="size-3" />
              <span>Ready</span>
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="h-5 px-2 gap-1 text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
            >
              <AlertCircle className="size-3" />
              <span>Not Configured</span>
            </Badge>
          )}

          <Button
            variant="outline"
            size="sm"
            onPress={handleBrowse}
            isDisabled={isSaving}
            className="h-7 px-2.5 text-xs cursor-pointer gap-1.5 border-border/80"
          >
            <FolderOpen className="size-3.5 text-muted-foreground" />
            <span>{isConfigured ? "Change Path" : "Browse..."}</span>
          </Button>
        </div>
      </div>

      {/* Middle: Detected Version & Path Display / Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-background/80 border border-border/60 text-xs">
        {/* Left: Path or Candidate Selector */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {availableCandidates.length > 1 ? (
            /* Multi-version Dropdown Selector */
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-[11px] text-muted-foreground shrink-0 font-medium">
                Version:
              </span>
              <select
                aria-label={`Select ${meta.name} version`}
                value={matchedCandidate?.executablePath || currentPath}
                onChange={(e) => {
                  const selected = availableCandidates.find(
                    (c) => c.executablePath === e.target.value
                  );
                  if (selected) handleSelectCandidate(selected);
                }}
                disabled={isSaving}
                className="bg-transparent font-medium text-foreground text-xs focus:outline-none cursor-pointer truncate max-w-[280px]"
              >
                {availableCandidates.map((cand, idx) => (
                  <option key={idx} value={cand.executablePath} className="bg-popover text-popover-foreground">
                    {cand.version ? `${cand.name || meta.name} (${cand.version})` : cand.name || cand.executablePath}
                  </option>
                ))}
              </select>
            </div>
          ) : matchedCandidate?.version || currentVersion ? (
            /* Single detected version badge */
            <Badge
              variant="secondary"
              className="font-mono text-[11px] font-semibold h-5 px-2 bg-primary/10 text-primary border-primary/20 shrink-0"
            >
              v{matchedCandidate?.version || currentVersion}
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground italic shrink-0">
              {isConfigured ? "Custom binary" : "No auto-detected version"}
            </span>
          )}

          {/* Executable Path Text with Tooltip */}
          {currentPath ? (
            <span
              className="font-mono text-[11px] text-muted-foreground truncate select-all"
              title={currentPath}
            >
              {currentPath}
            </span>
          ) : hasCandidates ? (
            <button
              type="button"
              onClick={() => handleSelectCandidate(availableCandidates[0])}
              className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="size-3" />
              <span>Use detected ({availableCandidates[0].executablePath})</span>
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground italic">
              Click Browse to locate binary executable
            </span>
          )}
        </div>

        {/* Right: Copy Button */}
        {currentPath && (
          <Button
            variant="ghost"
            size="sm"
            onPress={handleCopyPath}
            className="h-6 w-6 p-0 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
            title="Copy path"
          >
            {copied ? (
              <Check className="size-3 text-emerald-500" />
            ) : (
              <Copy className="size-3" />
            )}
          </Button>
        )}
      </div>

      {/* Unreal Engine Extension: Project Mapping Link / Drawer */}
      {executorKey === "unreal" && (
        <div className="pt-0.5">
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setShowUnrealProjects(!showUnrealProjects)}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-[11px] font-medium"
            >
              <FolderKanban className="size-3.5 text-primary" />
              <span>
                Unreal Project Mapping ({projectCount} project
                {projectCount !== 1 ? "s" : ""} linked)
              </span>
              <ChevronDown
                className={cn(
                  "size-3 transition-transform duration-200",
                  showUnrealProjects && "rotate-180"
                )}
              />
            </button>
          </div>

          {showUnrealProjects && (
            <div className="mt-2.5 p-3 rounded-lg border border-border/70 bg-background/50">
              <UnrealExecutorExtension
                runnerId={runnerId}
                runnerName={runnerName}
                settings={(activeConfig?.settings as Record<string, any>) || {}}
                onUpdateSettings={(newSettings) => {
                  onSave({
                    executorKey,
                    executablePath: currentPath,
                    version: currentVersion || null,
                    isEnabled: true,
                    settings: newSettings,
                  });
                }}
                disabled={isSaving}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
