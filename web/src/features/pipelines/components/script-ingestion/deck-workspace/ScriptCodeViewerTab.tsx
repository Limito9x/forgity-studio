import { useState } from "react";
import { Copy, Check, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ScriptCodeViewerTabProps {
  fileName: string;
  sourceCode: string;
}

export function ScriptCodeViewerTab({
  fileName,
  sourceCode,
}: ScriptCodeViewerTabProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!sourceCode) return;
    navigator.clipboard.writeText(sourceCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = sourceCode ? sourceCode.split("\n") : [];

  return (
    <div className="w-full h-full p-6 space-y-4 flex flex-col min-w-0 overflow-hidden">
      <div className="flex items-center justify-between pb-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
          <FileCode className="size-4 text-primary shrink-0" />
          <span className="font-semibold text-foreground truncate">{fileName}</span>
          <span>•</span>
          <span className="shrink-0">{lines.length} lines</span>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 shrink-0"
          onPress={handleCopy}
          isDisabled={!sourceCode}
        >
          {copied ? (
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
