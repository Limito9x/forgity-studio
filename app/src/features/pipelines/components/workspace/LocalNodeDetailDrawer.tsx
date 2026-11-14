import { useState } from "react";
import {
  FileCode2,
  ArrowRight,
  RefreshCw,
  X,
  Code2,
  ListTree,
  Copy,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { LocalDraftNode } from "../../types/workspaceConfig";

interface LocalNodeDetailDrawerProps {
  node: LocalDraftNode | null;
  isOpen: boolean;
  onClose: () => void;
  onReanalyzeNode?: (node: LocalDraftNode) => Promise<void>;
  onRemoveNode?: (nodeKey: string) => Promise<void>;
  onAddToPipeline?: (node: LocalDraftNode) => void;
  hasActivePipeline?: boolean;
}

export function LocalNodeDetailDrawer({
  node,
  isOpen,
  onClose,
  onReanalyzeNode,
  onRemoveNode,
  onAddToPipeline,
  hasActivePipeline = false,
}: LocalNodeDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<"contracts" | "source">("contracts");
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  if (!isOpen || !node) return null;

  const handleReanalyze = async () => {
    if (!onReanalyzeNode) return;
    setIsReanalyzing(true);
    try {
      await onReanalyzeNode(node);
      toast.success("Script re-analyzed successfully", {
        description: `Updated contracts for ${node.fileName}`,
      });
    } catch (err: any) {
      toast.error("Failed to re-analyze script", {
        description: err?.message || "Unknown error",
      });
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemoveNode) return;
    setIsRemoving(true);
    try {
      await onRemoveNode(node.key);
      toast.success(`Removed '${node.key}' from Palette`);
      onClose();
    } catch (err: any) {
      toast.error("Failed to remove script", {
        description: err?.message || "Unknown error",
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const handleCopyPath = () => {
    navigator.clipboard.writeText(node.fullPath);
    toast.success("File path copied to clipboard");
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border/80 bg-background/95 backdrop-blur-md shadow-2xl transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/70 px-5 py-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <FileCode2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {node.suggestedLabel || node.fileName}
            </h3>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono truncate">
              <span>{node.key}</span>
              <span>•</span>
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                {node.executor}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onPress={onClose}
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Path info bar */}
      <div className="flex items-center justify-between bg-muted/40 px-5 py-2 border-b border-border/40 text-xs">
        <span className="text-muted-foreground font-mono text-[11px] truncate max-w-[420px]" title={node.fullPath}>
          {node.fullPath}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onPress={handleCopyPath}
          className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
        >
          <Copy className="h-3 w-3" />
          Copy
        </Button>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 px-5 py-2 border-b border-border/50 bg-background shrink-0">
        <div className="flex items-center bg-muted/60 p-0.5 rounded-lg border border-border/60">
          <button
            type="button"
            onClick={() => setActiveTab("contracts")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
              activeTab === "contracts"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ListTree className="h-3.5 w-3.5" />
            Pins & Contracts
            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
              {node.inputs.length + node.outputs.length}
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("source")}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-all cursor-pointer ${
              activeTab === "source"
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Code2 className="h-3.5 w-3.5" />
            Source Code
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {activeTab === "contracts" ? (
          <div className="space-y-5">
            {node.description && (
              <div className="rounded-lg bg-card border border-border/60 p-3 text-xs text-muted-foreground leading-relaxed">
                {node.description}
              </div>
            )}

            {/* Inputs Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Inputs ({node.inputs.length})
                </span>
              </div>

              {node.inputs.length === 0 ? (
                <div className="text-xs text-muted-foreground/60 italic py-2">
                  No input pins defined.
                </div>
              ) : (
                <div className="divide-y divide-border/40 rounded-lg border border-border/60 bg-card overflow-hidden">
                  {node.inputs.map((pin) => (
                    <div key={pin.id} className="p-3 text-xs flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{pin.label || pin.id}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] font-mono h-4">
                            {pin.primitiveType || "String"}
                            {pin.cardinality && pin.cardinality !== "Single" ? ` (${pin.cardinality})` : ""}
                          </Badge>
                          {pin.isRequired && (
                            <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                              Req
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <span>pin_id: {pin.id}</span>
                        {pin.defaultValue !== undefined && pin.defaultValue !== null && (
                          <span>def: {String(pin.defaultValue)}</span>
                        )}
                      </div>
                      {pin.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{pin.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Outputs Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Outputs ({node.outputs.length})
                </span>
              </div>

              {node.outputs.length === 0 ? (
                <div className="text-xs text-muted-foreground/60 italic py-2">
                  No output pins defined.
                </div>
              ) : (
                <div className="divide-y divide-border/40 rounded-lg border border-border/60 bg-card overflow-hidden">
                  {node.outputs.map((pin) => (
                    <div key={pin.id} className="p-3 text-xs flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">{pin.label || pin.id}</span>
                        <Badge variant="outline" className="text-[10px] font-mono h-4">
                          {pin.primitiveType || "String"}
                          {pin.cardinality && pin.cardinality !== "Single" ? ` (${pin.cardinality})` : ""}
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">pin_id: {pin.id}</span>
                      {pin.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{pin.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <pre className="flex-1 w-full rounded-lg border border-border/60 bg-card p-4 font-mono text-xs text-foreground overflow-x-auto whitespace-pre leading-relaxed">
              {node.sourceCode || "# Source code not loaded or file is empty"}
            </pre>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="border-t border-border/70 bg-card/60 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={handleReanalyze}
            isDisabled={isReanalyzing || isRemoving}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isReanalyzing ? "animate-spin text-emerald-500" : ""}`} />
            <span>Re-analyze File</span>
          </Button>

          {onRemoveNode && (
            <Button
              variant="outline"
              size="sm"
              onPress={handleRemove}
              isDisabled={isReanalyzing || isRemoving}
              className="gap-1.5 text-xs h-8 text-destructive hover:bg-destructive/10 border-destructive/30"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Remove from Palette</span>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasActivePipeline && onAddToPipeline && (
            <Button
              size="sm"
              onPress={() => onAddToPipeline(node)}
              className="gap-1.5 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
            >
              <span>Add to Active Pipeline</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
