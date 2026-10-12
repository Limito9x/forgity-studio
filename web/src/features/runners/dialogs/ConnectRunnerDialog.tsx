import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useGenerateSetupToken } from "../hooks/useRunners";
import { useTokenStatusPolling } from "../hooks/useTokenStatusPolling";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { appConfig } from "@/config/appConfig";
import {
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Monitor,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function ConnectRunnerDialog({
  open,
  onOpenChange,
}: DialogProps<undefined>) {
  const [token, setToken] = useState<string>("");
  const [selectedOs, setSelectedOs] = useState<"windows" | "linux" | "macos">("windows");
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedOneLiner, setCopiedOneLiner] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const queryClient = useQueryClient();
  const { studioId: activeStudioId } = useCurrentStudio();
  const generateTokenMutation = useGenerateSetupToken();

  // Real-time polling for runner handshake
  const tokenStatusQuery = useTokenStatusPolling(token, open);
  const isConnected = tokenStatusQuery.data?.status === "connected";

  const handleGenerate = () => {
    generateTokenMutation.mutate(
      {
        data: {
          studioId: activeStudioId || undefined,
        },
      },
      {
        onSuccess: (res: any) => {
          setToken(res.token);
          toast.success("New setup token generated");
        },
        onError: (err: any) => {
          toast.error(err?.message || "Failed to generate setup token");
        },
      }
    );
  };

  // Auto-generate token on open if not present
  useEffect(() => {
    if (open && !token && !generateTokenMutation.isPending) {
      handleGenerate();
    }
    if (!open) {
      setCopiedToken(false);
      setCopiedOneLiner(false);
      setShowManual(false);
    }
  }, [open]);

  // When connection succeeds, refresh runner lists
  useEffect(() => {
    if (isConnected) {
      queryClient.invalidateQueries({ queryKey: ["runners"] });
      toast.success(
        `Workstation '${tokenStatusQuery.data?.runnerName || "Runner"}' connected successfully!`
      );
    }
  }, [isConnected]);

  const copyToClipboard = async (text: string, type: "token" | "oneliner") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "token") {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
        toast.success("Setup token copied to clipboard");
      } else {
        setCopiedOneLiner(true);
        setTimeout(() => setCopiedOneLiner(false), 2000);
        toast.success("One-liner install command copied to clipboard");
      }
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5189";
  const apiBaseUrl = `${currentOrigin}/api`;

  const getOneLinerCommand = () => {
    const bootstrapUrl = `${apiBaseUrl}/runners/bootstrap`;
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : "";

    if (selectedOs === "windows") {
      return `irm "${bootstrapUrl}/install.ps1${tokenParam}" | iex`;
    }
    return `curl -fsSL "${bootstrapUrl}/install.sh${tokenParam}" | bash`;
  };

  const oneLinerCommand = getOneLinerCommand();

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Connect New Runner"
      description={`Pair a local workstation, render PC, or cloud GPU node to ${appConfig.name}.`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-emerald-500" />
            <span>Secure 1-time mutual token handshake</span>
          </div>
          <Button
            variant={isConnected ? "default" : "outline"}
            size="sm"
            onPress={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            {isConnected ? "Done & View Runners" : "Close"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {isConnected ? (
          /* Live Connected Success Card */
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-500">
              <CheckCircle2 className="size-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-bold text-foreground">
                Workstation Connected Successfully!
              </h3>
              <p className="text-xs text-muted-foreground">
                Your runner daemon is online, verified, and ready to execute automation pipeline tasks.
              </p>
            </div>

            <div className="mx-auto max-w-md rounded-lg border border-border/80 bg-background/80 p-3 text-left space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Monitor className="size-3.5 text-primary" />
                  <span>Runner Name:</span>
                </span>
                <span className="font-semibold text-foreground">
                  {tokenStatusQuery.data?.runnerName || "Workstation"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Cpu className="size-3.5 text-primary" />
                  <span>Machine Key:</span>
                </span>
                <span className="text-muted-foreground truncate max-w-[200px]">
                  {tokenStatusQuery.data?.machineKey || "N/A"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* Active Pairing Workflow */
          <>
            {/* OS Tab Selector */}
            <div className="flex items-center justify-between gap-2 p-1 bg-muted/60 rounded-lg border">
              <button
                type="button"
                onClick={() => setSelectedOs("windows")}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                  selectedOs === "windows"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>🪟 Windows (PowerShell)</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedOs("linux")}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                  selectedOs === "linux"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>🐧 Linux (Bash)</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedOs("macos")}
                className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 rounded-md text-xs font-medium transition-all ${
                  selectedOs === "macos"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>🍎 macOS (Terminal)</span>
              </button>
            </div>

            {/* 1-Click One-Liner Hero Box */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Terminal className="size-3.5 text-primary" />
                  <span>1-Click Bootstrap Installation</span>
                </span>
                <span className="flex items-center gap-1 text-[11px] text-amber-500 font-medium animate-pulse">
                  <Clock className="size-3" />
                  <span>Waiting for runner connection...</span>
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-zinc-950 text-zinc-100 dark:bg-zinc-900 border border-zinc-800 font-mono text-xs shadow-inner min-w-0">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto select-all pr-2 scrollbar-thin">
                  <span className="text-emerald-400 select-none shrink-0">$</span>
                  <span className="whitespace-nowrap font-mono">{oneLinerCommand}</span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  isDisabled={!token}
                  onPress={() => copyToClipboard(oneLinerCommand, "oneliner")}
                  className="cursor-pointer shrink-0 gap-1.5 font-medium h-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700"
                >
                  {copiedOneLiner ? (
                    <>
                      <Check className="size-3.5 text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>Copy 1-Click</span>
                    </>
                  )}
                </Button>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Paste and run this single command in terminal. It automatically provisions Python virtualenv, registers your runner, and sets up the background daemon.
              </p>
            </div>

            {/* Token Details & Manual Options Accordion */}
            <div className="rounded-xl border border-border/80 bg-muted/30 overflow-hidden text-xs">
              <button
                type="button"
                onClick={() => setShowManual(!showManual)}
                className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">Advanced / Manual Options & Token</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-background border">
                    {token || "Loading..."}
                  </span>
                </div>
                {showManual ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              </button>

              {showManual && (
                <div className="p-3 border-t border-border/60 bg-background/50 space-y-3 animate-in fade-in-50">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Clock className="size-3 text-primary" />
                      <span>Setup Token (Valid for 30 minutes)</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={handleGenerate}
                      isDisabled={generateTokenMutation.isPending}
                      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <RefreshCw
                        className={`size-3 mr-1 ${
                          generateTokenMutation.isPending ? "animate-spin" : ""
                        }`}
                      />
                      <span>Regenerate</span>
                    </Button>
                  </div>

                  <div className="flex items-center gap-2 font-mono">
                    <input
                      readOnly
                      value={token}
                      className="flex-1 px-2.5 py-1.5 rounded-md border bg-muted/50 text-foreground select-all text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => copyToClipboard(token, "token")}
                      className="h-8 shrink-0 cursor-pointer text-xs"
                    >
                      {copiedToken ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                    </Button>
                  </div>

                  <div className="space-y-1.5 pt-1 text-[11px] text-muted-foreground">
                    <p className="font-semibold text-foreground">Manual local setup (if repository source is already cloned):</p>
                    <pre className="p-2 rounded bg-muted font-mono overflow-x-auto select-all">
                      {`.\\runner.bat register --url "${apiBaseUrl}" --token "${token}" --non-interactive\n.\\runner.bat service install\n.\\runner.bat service start`}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </BaseDialog>
  );
}
