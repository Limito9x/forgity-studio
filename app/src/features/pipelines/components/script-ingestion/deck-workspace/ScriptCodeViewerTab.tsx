import { useState } from "react";
import { Copy, Check, FileCode, Download, Sparkles, AlertTriangle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { appConfig } from "@/config/appConfig";
import {
  scanScriptSecurityFlags,
  downloadScriptFile,
} from "../../../utils/pipelineSecurityAudit";

interface ScriptCodeViewerTabProps {
  fileName: string;
  sourceCode: string;
  executor?: string;
}

export function ScriptCodeViewerTab({
  fileName,
  sourceCode,
  executor,
}: ScriptCodeViewerTabProps) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const lines = sourceCode ? sourceCode.split("\n") : [];
  const securityFlags = scanScriptSecurityFlags(sourceCode);

  const handleCopyCode = () => {
    if (!sourceCode) return;
    navigator.clipboard.writeText(sourceCode);
    setCopiedCode(true);
    toast.success("Script source copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyPrompt = () => {
    if (!sourceCode) return;
    const prompt = [
      `# ${appConfig.name.toUpperCase()} - SINGLE SCRIPT SECURITY AUDIT`,
      `Please audit this Python script ("${fileName}") designed to run in ${appConfig.name} on ${executor || "Python"}:`,
      `Evaluate for: malicious intent, network leakage, unauthorized file wipes, and unsafe system subprocess execution.`,
      `Conclude with: [SAFE / CAUTION / DANGEROUS] and a short summary.`,
      ``,
      "```python",
      sourceCode,
      "```",
    ].join("\n");

    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    toast.success("AI security review prompt copied to clipboard!");
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const handleDownload = () => {
    if (!sourceCode) return;
    downloadScriptFile(fileName, sourceCode);
    toast.success(`Downloaded ${fileName}`);
  };

  return (
    <div className="w-full h-full p-6 space-y-4 flex flex-col min-w-0 overflow-hidden">
      <div className="flex items-center justify-between pb-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
          <FileCode className="size-4 text-primary shrink-0" />
          <span className="font-semibold text-foreground truncate">{fileName}</span>
          {executor && (
            <Badge variant="outline" className="text-[10px] uppercase font-mono h-4.5">
              {executor}
            </Badge>
          )}
          <span>•</span>
          <span className="shrink-0">{lines.length} lines</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 shrink-0"
            onPress={handleCopyPrompt}
            isDisabled={!sourceCode}
          >
            {copiedPrompt ? (
              <>
                <Check className="size-3.5 text-emerald-500" />
                Prompt Copied!
              </>
            ) : (
              <>
                <Sparkles className="size-3.5 text-primary" />
                Copy AI Prompt
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 shrink-0"
            onPress={handleDownload}
            isDisabled={!sourceCode}
          >
            <Download className="size-3.5" />
            Download .py
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5 shrink-0"
            onPress={handleCopyCode}
            isDisabled={!sourceCode}
          >
            {copiedCode ? (
              <>
                <Check className="size-3.5 text-emerald-500" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Copy Code
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Security Scan Banner */}
      {sourceCode && (
        <>
          {securityFlags.length > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs space-y-1.5 animate-in fade-in shrink-0">
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
            <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1.5 text-xs text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="size-3.5" />
              <span>No immediate suspicious calls (sockets/system wipes) detected by static heuristics.</span>
            </div>
          )}
        </>
      )}

      {!sourceCode ? (
        <div className="p-12 text-center text-xs text-muted-foreground border border-dashed rounded-xl flex-1 flex items-center justify-center">
          Source code is not available for preview.
        </div>
      ) : (
        <div className="flex-1 min-w-0 rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden font-mono text-xs shadow-inner flex flex-col">
          <div className="overflow-auto flex-1 p-4 flex">
            {/* Line numbers column */}
            <div className="select-none pr-4 text-right text-zinc-600 border-r border-zinc-800 shrink-0">
              {lines.map((_, i) => (
                <div key={i} className="leading-6">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Code content column */}
            <pre className="pl-4 text-zinc-200 leading-6 flex-1 whitespace-pre">
              {lines.map((line, i) => (
                <div key={i} className="leading-6">
                  {line || "\n"}
                </div>
              ))}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
