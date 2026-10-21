import { useState } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import type { DialogProps } from "@/lib/dialog-registry";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export interface BulkImportRunnerEnvData {
  onImport: (items: Array<{ key: string; value: string }>) => void;
}

export function BulkImportRunnerEnvDialog({
  open,
  onOpenChange,
  data,
}: DialogProps<BulkImportRunnerEnvData>) {
  const [text, setText] = useState("");

  const handleImport = () => {
    if (!text.trim()) {
      onOpenChange(false);
      return;
    }

    const lines = text.split("\n");
    const result: Array<{ key: string; value: string }> = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const eqIdx = line.indexOf("=");
      if (eqIdx <= 0) continue;

      const rawKey = line.substring(0, eqIdx).trim();
      let rawVal = line.substring(eqIdx + 1).trim();

      if (
        (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
        (rawVal.startsWith("'") && rawVal.endsWith("'"))
      ) {
        rawVal = rawVal.substring(1, rawVal.length - 1);
      }

      const normalizedKey = rawKey.replace(/\s+/g, "_").toUpperCase();
      if (normalizedKey) {
        result.push({ key: normalizedKey, value: rawVal });
      }
    }

    if (result.length > 0) {
      data?.onImport(result);
      toast.success(`Imported ${result.length} environment variable(s)`);
      setText("");
      onOpenChange(false);
    } else {
      toast.error("No valid KEY=VALUE pairs found in pasted text");
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Bulk Paste Environment Variables"
      description="Paste lines from your .env file. Each line should follow the KEY=VALUE format."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button
            variant="outline"
            size="sm"
            onPress={() => onOpenChange(false)}
            className="text-xs h-8 cursor-pointer"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onPress={handleImport}
            className="text-xs h-8 cursor-pointer gap-1.5"
          >
            <Plus className="size-3.5" />
            <span>Import Variables</span>
          </Button>
        </div>
      }
    >
      <div className="py-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`GEMINI_API_KEY=AQ.Ab8RN6Jg4bmqx...\nOPENAI_API_KEY=sk-proj-...\nCUSTOM_ASSET_DIR=D:\\Assets`}
          className="font-mono text-xs min-h-[180px] resize-y"
          aria-label="Bulk environment text"
        />
      </div>
    </BaseDialog>
  );
}
