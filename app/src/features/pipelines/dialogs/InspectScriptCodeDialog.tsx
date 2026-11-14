import { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileCode,
  Copy,
  Check,
  Download,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { appConfig } from "@/config/appConfig";
import {
  scanScriptSecurityFlags,
  downloadScriptFile,
} from "../utils/pipelineSecurityAudit";

interface InspectScriptCodeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  executor?: string;
  scriptContent?: string | null;
}

export function InspectScriptCodeDialog({
  isOpen,
  onClose,
  fileName,
  executor,
  scriptContent,
}: InspectScriptCodeDialogProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const lines = scriptContent ? scriptContent.split("\n") : [];
  const securityFlags = scanScriptSecurityFlags(scriptContent);

  const handleCopyCode = () => {
    if (!scriptContent) return;
    navigator.clipboard.writeText(scriptContent);
    setCopiedCode(true);
    toast.success("Script source copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyPrompt = () => {
    if (!scriptContent) return;
    const prompt = [
      `# ${appConfig.name.toUpperCase()} - SINGLE SCRIPT SECURITY AUDIT`,
      `Please audit this Python script ("${fileName}") designed to run in ${appConfig.name} on ${executor || "Python"}:`,
      `Evaluate for: malicious intent, network leakage, unauthorized file wipes, and unsafe system subprocess execution.`,
      `Conclude with: [SAFE / CAUTION / DANGEROUS] and a short summary.`,
      ``,
      "```python",
      scriptContent,
      "```",
    ].join("\n");

    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    toast.success("AI security review prompt copied to clipboard!");
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleDownload = () => {
    if (!scriptContent) return;
    downloadScriptFile(fileName, scriptContent);
    toast.success(`Downloaded ${fileName}`);
  };

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} className="sm:max-w-3xl">
      <DialogHeader className="border-b pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 truncate">
            <FileCode className="size-5 text-primary shrink-0" />
            <DialogTitle className="text-sm font-semibold truncate">
              {fileName}
            </DialogTitle>
            {executor && (
              <Badge variant="outline" className="text-[10px] uppercase font-mono h-4.5">
                {executor}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">• {lines.length} lines</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7.5 text-xs gap-1.5"
              onPress={handleCopyPrompt}
              isDisabled={!scriptContent}
            >
              {copiedPrompt ? (
                <>
                  <Check className="size-3 text-emerald-500" />
                  Prompt Copied!
                </>
              ) : (
                <>
                  <Sparkles className="size-3 text-primary" />
                  Copy AI Prompt
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-7.5 text-xs gap-1.5"
              onPress={handleDownload}
              isDisabled={!scriptContent}
            >
              <Download className="size-3" />
              Download .py
            </Button>
          </div>
        </div>
      </DialogHeader>

      <div className="py-3 space-y-3">
        {/* Security Scan Banner */}
        {securityFlags.length > 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs space-y-1.5 animate-in fade-in">
            <div className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-3.5" />
              <span>Heuristic Security Flags Detected</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {securityFlags.map((flag) => (
                <Badge
                  key={flag.id}
                  variant={flag.severity === "danger" ? "destructive" : "secondary"}
                  className="text-[10px] gap-1 py-0.5"
                >
                  <span>{flag.label}:</span>
                  <span className="font-normal opacity-90">{flag.description}</span>
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="size-3.5" />
            <span>No immediate suspicious calls (sockets/system wipes) detected by static heuristics.</span>
          </div>
        )}

        {/* Code Content Container */}
        {!scriptContent ? (
          <div className="p-12 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
            Source code is not embedded or available in this package.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 font-mono text-xs shadow-inner flex flex-col max-h-[50vh] overflow-hidden">
            <div className="overflow-auto flex-1 p-3.5 flex">
              {/* Line numbers */}
              <div className="select-none pr-3.5 text-right text-zinc-600 border-r border-zinc-800 shrink-0">
                {lines.map((_, i) => (
                  <div key={i} className="leading-5">
                    {i + 1}
                  </div>
                ))}
              </div>

              {/* Code */}
              <pre className="pl-3.5 text-zinc-200 leading-5 flex-1 whitespace-pre overflow-x-auto">
                {lines.map((line, i) => (
                  <div key={i} className="leading-5">
                    {line || "\n"}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="border-t pt-2.5 flex items-center justify-between sm:justify-between w-full">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5"
          onPress={handleCopyCode}
          isDisabled={!scriptContent}
        >
          {copiedCode ? (
            <>
              <Check className="size-3.5 text-emerald-500" />
              Copied Source!
            </>
          ) : (
            <>
              <Copy className="size-3.5" />
              Copy Full Code
            </>
          )}
        </Button>

        <Button size="sm" variant="secondary" className="h-8 text-xs" onPress={onClose}>
          Close Preview
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

