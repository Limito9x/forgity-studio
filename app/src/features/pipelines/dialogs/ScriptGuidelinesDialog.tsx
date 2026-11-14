import { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Copy,
  Check,
  Sparkles,
  Info,
  ExternalLink,
  Code2,
} from "lucide-react";
import { toast } from "sonner";
import { SOFTWARE_DEFINITIONS, type SoftwareDefinition } from "@/features/runners/constants/dccEngines";
import { Link } from "@tanstack/react-router";

interface ScriptGuidelinesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenBatchUpload?: () => void;
}

export function ScriptGuidelinesDialog({
  isOpen,
  onClose,
  onOpenBatchUpload,
}: ScriptGuidelinesDialogProps) {
  const templatedSoftwares = SOFTWARE_DEFINITIONS.filter(
    (def) => def.scriptTemplate
  );

  const [activeSoftwareId, setActiveSoftwareId] = useState<string>(
    templatedSoftwares[0]?.id || "blender"
  );
  const [hasCopied, setHasCopied] = useState(false);

  const currentSoftware: SoftwareDefinition | undefined = templatedSoftwares.find(
    (s) => s.id === activeSoftwareId
  ) || templatedSoftwares[0];

  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code.trim());
      setHasCopied(true);
      toast.success("Script template copied to clipboard!");
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      toast.error("Failed to copy code to clipboard.");
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog isOpen={isOpen} onOpenChange={(open) => !open && onClose()} className="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <BookOpen className="size-4 text-primary" />
          <span>Script Guidelines & Code Templates</span>
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground pt-1">
          Learn how to structure your Python scripts so the AST engine can automatically extract Node inputs, outputs, and executor engines.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1">
        {/* Environment & Libraries Callout */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
          <div className="flex items-start gap-2.5">
            <Info className="size-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-semibold text-foreground">
                Runtime Dependencies & Libraries
              </h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Scripts execute directly on your connected workstation Runners. Built-in engine modules (like <code className="font-mono text-primary">bpy</code> for Blender or <code className="font-mono text-primary">unreal</code> for Unreal Engine) are pre-bundled. Any third-party packages (<code className="font-mono text-foreground">numpy</code>, <code className="font-mono text-foreground">pillow</code>, etc.) depend on the Python environment installed on that specific Runner machine.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end pt-1">
            <Link
              to="/runners"
              onClick={onClose}
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium"
            >
              <span>Verify Connected Runners & Installed Engines</span>
              <ExternalLink className="size-3" />
            </Link>
          </div>
        </div>

        {/* 4 Golden Rules */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px]">1</span>
              <span>Automatic Engine Detection</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Having <code className="font-mono text-foreground text-[10px]">import bpy</code> selects <strong>Blender</strong>. <code className="font-mono text-foreground text-[10px]">import unreal</code> selects <strong>Unreal Engine</strong>. Otherwise defaults to standard Python.
            </p>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px]">2</span>
              <span>Entry Point & Docstring</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Define a top-level <code className="font-mono text-foreground text-[10px]">main(...)</code> or <code className="font-mono text-foreground text-[10px]">run(...)</code> function. The function docstring becomes the Node Description.
            </p>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px]">3</span>
              <span>Type-Hinted Inputs</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Parameters with type annotations (<code className="font-mono text-foreground text-[10px]">str, int, float, bool, list, dict</code>) become input pins. Assigning default values (<code className="font-mono text-foreground text-[10px]">= 64</code>) makes them optional.
            </p>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              <span className="flex size-4 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px]">4</span>
              <span>Dictionary Return (Outputs)</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Return a Python <code className="font-mono text-foreground text-[10px]">dict</code> of outputs (e.g. <code className="font-mono text-foreground text-[10px]">{`{"output_file": ..., "count": ...}`}</code>). Each key automatically maps to an Output Pin.
            </p>
          </div>
        </div>

        {/* Engine Tabs (From dccEngines Registry) */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Code2 className="size-3.5 text-primary" />
              <span>Standard Code Templates (Registry)</span>
            </span>
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border/60">
              {templatedSoftwares.map((sw) => {
                const isActive = sw.id === activeSoftwareId;
                return (
                  <button
                    key={sw.id}
                    type="button"
                    onClick={() => setActiveSoftwareId(sw.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      isActive
                        ? "bg-background text-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {sw.name}
                  </button>
                );
              })}
            </div>
          </div>

          {currentSoftware?.scriptTemplate && (
            <div className="rounded-xl border border-border/70 bg-card overflow-hidden">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-muted/30 border-b border-border/60">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold font-mono text-foreground">
                      {currentSoftware.scriptTemplate.fileName}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {currentSoftware.category}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {currentSoftware.scriptTemplate.summary}
                  </p>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5 cursor-pointer"
                    onPress={() => handleCopyCode(currentSoftware.scriptTemplate!.code)}
                  >
                    {hasCopied ? (
                      <>
                        <Check className="size-3 text-green-500" />
                        <span className="text-green-500">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="size-3 text-muted-foreground" />
                        <span>Copy Template</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Modules & Environment Note */}
              <div className="px-3 py-2 bg-muted/15 border-b border-border/40 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-muted-foreground font-medium">Pre-bundled modules:</span>
                  {currentSoftware.scriptTemplate.builtinModules.map((m) => (
                    <span key={m} className="px-1.5 py-0.2 rounded font-mono bg-muted text-[10px] text-foreground">
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* Code Box */}
              <div className="relative">
                <pre className="p-3.5 text-xs font-mono leading-relaxed text-foreground bg-background/80 overflow-x-auto max-h-[38vh] select-text">
                  <code>{currentSoftware.scriptTemplate.code.trim()}</code>
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>

      <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
        <Button variant="ghost" size="sm" onPress={onClose} className="cursor-pointer">
          Close
        </Button>
        {onOpenBatchUpload && (
          <Button
            variant="default"
            size="sm"
            onPress={() => {
              onClose();
              onOpenBatchUpload();
            }}
            className="cursor-pointer gap-1.5"
          >
            <Sparkles className="size-3.5" />
            <span>Upload Scripts Now</span>
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
