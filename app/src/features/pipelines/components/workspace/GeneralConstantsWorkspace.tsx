import {
  Folder,
  FileCode,
  Plus,
  Trash2,
  Copy,
  Check,
  HardDrive,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";
import { openNativeFileOrFolderDialog } from "@/lib/platform/filePickerStrategy";
import type { WorkspaceConstantItem, ConstantDataType } from "../../types/workspaceConfig";

interface GeneralConstantsWorkspaceProps {
  items: WorkspaceConstantItem[];
  rootPath?: string | null;
  copiedKey: string | null;
  onCopyKey: (key: string) => void;
  onUpdateField: (id: string, field: keyof WorkspaceConstantItem, val: any) => void;
  onAddItem: () => void;
  onDeleteItem: (id: string) => void;
}

export function GeneralConstantsWorkspace({
  items,
  rootPath,
  copiedKey,
  onCopyKey,
  onUpdateField,
  onAddItem,
  onDeleteItem,
}: GeneralConstantsWorkspaceProps) {
  const handlePickFileOrFolder = async (id: string, mode: "file" | "folder") => {
    try {
      const picked = await openNativeFileOrFolderDialog({
        mode,
        title: mode === "folder" ? "Select Directory" : "Select File",
        defaultPath: rootPath || undefined,
      });
      if (picked) {
        onUpdateField(id, "value", picked);
        toast.success(`Selected ${mode}: ${picked}`);
      }
    } catch (err: any) {
      toast.error("File selection failed", { description: err?.message });
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Header Bar */}
      <div className="px-4 py-2 border-b border-border/80 bg-card/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-semibold text-foreground">
            General Machine Constants
          </span>
        </div>

        <Button
          size="sm"
          variant="outline"
          onPress={onAddItem}
          className="gap-1.5 text-xs h-7 cursor-pointer"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Constant</span>
        </Button>
      </div>

      {/* Full-bleed Content List */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="py-20 text-center text-xs text-muted-foreground">
            <HardDrive className="h-8 w-8 mx-auto mb-2 opacity-30 text-emerald-400" />
            <p className="font-medium text-foreground">No General Constants</p>
            <p className="mt-1">
              Click &apos;Add Constant&apos; above to define machine paths, directories, prefixes or flags.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {/* Table Header Row */}
            <div className="grid grid-cols-12 gap-3 px-4 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20 border-b border-border/60 sticky top-0 z-10 backdrop-blur-xs">
              <div className="col-span-4">Constant Key</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-5">Value</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {/* Constant Rows */}
            {items.map((item) => {
              const itemId = item.id || item.key;
              return (
                <div
                  key={itemId}
                  className="grid grid-cols-12 gap-3 items-center px-4 py-2 hover:bg-muted/15 transition-colors text-xs"
                >
                  {/* Key */}
                  <div className="col-span-4 flex items-center gap-1.5">
                    <Input
                      value={item.key}
                      onChange={(e) => onUpdateField(itemId, "key", e.target.value.toUpperCase())}
                      placeholder="MY_CONSTANT_KEY"
                      className="font-mono text-xs h-8 uppercase bg-background font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => onCopyKey(item.key)}
                      className="p-1 rounded text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                      aria-label="Copy Variable Reference"
                    >
                      {copiedKey === item.key ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Type via React Aria Select */}
                  <div className="col-span-2">
                    <Select
                      selectedKey={item.dataType || "String"}
                      onSelectionChange={(k) => onUpdateField(itemId, "dataType", String(k) as ConstantDataType)}
                      className="w-full"
                    >
                      <SelectTrigger className="h-8 px-2.5 text-xs bg-background border-border/80 text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent placement="bottom start" className="w-[140px] bg-popover/95 backdrop-blur-md border border-border/80 shadow-xl p-1 rounded-lg">
                        <SelectItem id="String" textValue="String" className="px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted/60">
                          String
                        </SelectItem>
                        <SelectItem id="Path" textValue="Path" className="px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted/60">
                          Path
                        </SelectItem>
                        <SelectItem id="Array" textValue="Array" className="px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted/60">
                          Array
                        </SelectItem>
                        <SelectItem id="Number" textValue="Number" className="px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted/60">
                          Number
                        </SelectItem>
                        <SelectItem id="Boolean" textValue="Boolean" className="px-2 py-1.5 text-xs rounded cursor-pointer hover:bg-muted/60">
                          Boolean
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Value with Folder / File Browse */}
                  <div className="col-span-5 flex items-center gap-1">
                    <Input
                      value={
                        Array.isArray(item.value)
                          ? JSON.stringify(item.value)
                          : String(item.value ?? "")
                      }
                      onChange={(e) => onUpdateField(itemId, "value", e.target.value)}
                      placeholder="Value or path..."
                      className="font-mono text-xs h-8 flex-1 bg-background"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => handlePickFileOrFolder(itemId, "folder")}
                      className="h-8 px-2 text-xs shrink-0 cursor-pointer"
                      aria-label="Pick Folder"
                    >
                      <Folder className="h-3.5 w-3.5 text-amber-500" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => handlePickFileOrFolder(itemId, "file")}
                      className="h-8 px-2 text-xs shrink-0 cursor-pointer"
                      aria-label="Pick File"
                    >
                      <FileCode className="h-3.5 w-3.5 text-emerald-500" />
                    </Button>
                  </div>

                  {/* Delete */}
                  <div className="col-span-1 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onPress={() => onDeleteItem(itemId)}
                      className="size-7 text-muted-foreground hover:text-destructive cursor-pointer"
                      aria-label="Delete Constant"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
