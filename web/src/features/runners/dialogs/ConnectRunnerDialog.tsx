import { useState, useEffect } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { useGenerateSetupToken } from "../hooks/useRunners";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Copy,
  Check,
  RefreshCw,
  Terminal,
  Clock,
  ShieldCheck,
} from "lucide-react";

export function ConnectRunnerDialog({
  open,
  onOpenChange,
}: DialogProps<undefined>) {
  const [token, setToken] = useState<string>("");
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState(false);

  const generateTokenMutation = useGenerateSetupToken();

  const handleGenerate = () => {
    generateTokenMutation.mutate(
      {
        data: {},
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
      setCopiedCommand(false);
    }
  }, [open]);

  const copyToClipboard = async (text: string, type: "token" | "command") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "token") {
        setCopiedToken(true);
        setTimeout(() => setCopiedToken(false), 2000);
        toast.success("Setup token copied to clipboard");
      } else {
        setCopiedCommand(true);
        setTimeout(() => setCopiedCommand(false), 2000);
        toast.success("Command copied to clipboard");
      }
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const registerCommand = `.\\runner.bat register`;

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Connect New Runner"
      description="Pair a local graphic workstation, render PC, or cloud worker to Automation Studio."
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 text-emerald-500" />
            <span>Secure 1-time mutual pairing</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onPress={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Done
          </Button>
        </div>
      }
    >
      <div className="space-y-5 py-1">
        {/* Token Card */}
        <div className="rounded-xl border border-border/80 bg-muted/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <Clock className="size-3.5 text-primary" />
              <span>One-Time Setup Token (15m validity)</span>
            </span>

            <Button
              variant="ghost"
              size="sm"
              onPress={handleGenerate}
              isDisabled={generateTokenMutation.isPending}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <RefreshCw
                className={`size-3.5 mr-1 ${
                  generateTokenMutation.isPending ? "animate-spin" : ""
                }`}
              />
              <span>Generate New</span>
            </Button>
          </div>

          {generateTokenMutation.isPending && !token ? (
            <div className="h-12 flex items-center justify-center text-xs text-muted-foreground animate-pulse bg-background/50 rounded-lg border border-dashed">
              Generating secure pairing token...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1 font-mono text-sm sm:text-base font-bold tracking-wider px-3.5 py-2.5 bg-background rounded-lg border border-border/80 text-foreground overflow-x-auto select-all">
                {token || "Click Generate New"}
              </div>

              <Button
                variant="secondary"
                size="default"
                isDisabled={!token}
                onPress={() => copyToClipboard(token, "token")}
                className="cursor-pointer shrink-0 gap-1.5 font-medium"
              >
                {copiedToken ? (
                  <>
                    <Check className="size-4 text-emerald-500" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-4" />
                    <span>Copy Token</span>
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* 3 Step Guide */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quick Pairing Steps
          </h4>

          <div className="grid gap-3 text-sm">
            {/* Step 1 */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-card">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                1
              </div>
              <div className="space-y-1 flex-1">
                <p className="font-medium text-foreground leading-snug">
                  Open terminal in your worker directory
                </p>
                <p className="text-xs text-muted-foreground">
                  Navigate to the <code className="px-1 py-0.5 rounded bg-muted font-mono">workers/</code> directory on your workstation.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-card">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                2
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                <p className="font-medium text-foreground leading-snug">
                  Execute the registration command
                </p>
                <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-zinc-950 text-zinc-100 dark:bg-zinc-900 border font-mono text-xs">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <Terminal className="size-3.5 text-zinc-400 shrink-0" />
                    <span className="truncate">{registerCommand}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() => copyToClipboard(registerCommand, "command")}
                    className="h-6 px-2 text-zinc-300 hover:text-white hover:bg-zinc-800 cursor-pointer shrink-0"
                  >
                    {copiedCommand ? (
                      <Check className="size-3 text-emerald-400" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  When prompted, paste the Setup Token from above.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3 p-3 rounded-lg border border-border/60 bg-card">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs">
                3
              </div>
              <div className="space-y-1 flex-1">
                <p className="font-medium text-foreground leading-snug">
                  Automatic discovery & hardware profiling
                </p>
                <p className="text-xs text-muted-foreground">
                  The runner will immediately scan its CPU, RAM, GPUs (e.g. RTX 3050), and disks, then appear live on your dashboard.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BaseDialog>
  );
}
