import { Boxes, Layers } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DialogProps } from "@/lib/dialog-registry";
import type { LocalStructDefinition } from "../../types/workspaceConfig";

interface LocalStructPreviewDialogData {
  struct: LocalStructDefinition;
}

export function LocalStructPreviewDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<LocalStructPreviewDialogData>) {
  const struct = data?.struct;
  if (!struct) return null;

  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} className="sm:max-w-md">
      <DialogHeader>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">{struct.displayName}</DialogTitle>
            <DialogDescription className="text-xs font-mono text-muted-foreground">
              Slug: {struct.slug}
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-3 py-2">
        {struct.description && (
          <p className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded-md">
            {struct.description}
          </p>
        )}

        <div className="space-y-1">
          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            Fields ({struct.fields.length})
          </span>

          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 divide-y divide-border/30">
            {struct.fields.map((f) => (
              <div key={f.name} className="flex items-center justify-between pt-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <span className="font-mono text-foreground font-medium block truncate">
                    {f.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground block truncate">
                    {f.label}
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {f.type}
                  </Badge>
                  {f.cardinality === "Array" && (
                    <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-sky-500/10 text-sky-500">
                      Array
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-[11px] text-foreground space-y-1">
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
            Auto-Generated Companion Nodes
          </p>
          <p className="text-muted-foreground text-[10px]">
            • <strong>Make {struct.displayName}</strong>: Packs {struct.fields.length} inputs into 1 struct output.
          </p>
          <p className="text-muted-foreground text-[10px]">
            • <strong>Break {struct.displayName}</strong>: Unpacks struct input into {struct.fields.length} individual field outputs.
          </p>
        </div>
      </div>

      <DialogFooter className="mt-2 border-t pt-3">
        <Button variant="outline" size="sm" onPress={() => onOpenChange(false)} className="h-8 text-xs">
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

