import { useState, useMemo, useEffect } from "react";
import {
  Save,
  ArrowLeft,
  HardDrive,
  Gamepad2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocalConstantsQuery } from "../../hooks/workspace";
import type { WorkspaceConstantItem, ConstantScope, ConstantDataType } from "../../types/workspaceConfig";
import { UnrealContentVaultWorkspace } from "./UnrealContentVaultWorkspace";
import { GeneralConstantsWorkspace } from "./GeneralConstantsWorkspace";

interface LocalConstantsManagerPageProps {
  projectId: string;
  rootPath?: string | null;
  onBackToCanvas: () => void;
}

export function LocalConstantsManagerPage({ projectId, rootPath, onBackToCanvas }: LocalConstantsManagerPageProps) {
  const { constants, saveConstants } = useLocalConstantsQuery(rootPath ?? null);
  const [activeTab, setActiveTab] = useState<"general" | "unreal">("general");

  // Local state for constant items with permanent stable IDs
  const [items, setItems] = useState<WorkspaceConstantItem[]>(() =>
    constants.map((c, i) => ({ ...c, id: c.id || `c_${i}_${Date.now()}` }))
  );
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Keep synced with constants query
  useEffect(() => {
    setItems((prev) => {
      return constants.map((c, i) => {
        const match = prev.find((p) => p.key === c.key);
        return { ...c, id: match?.id || c.id || `c_${i}_${Date.now()}` };
      });
    });
    setIsDirty(false);
  }, [constants]);

  const generalItems = useMemo(
    () => items.filter((c) => (c.scope || "General") !== "Unreal"),
    [items]
  );
  const unrealItems = useMemo(
    () => items.filter((c) => (c.scope || "General") === "Unreal"),
    [items]
  );

  const handleUpdateItemField = (id: string, field: keyof WorkspaceConstantItem, val: any) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
    setIsDirty(true);
  };

  const handleAddItem = (newItem: WorkspaceConstantItem) => {
    const withId = { ...newItem, id: newItem.id || `c_${Date.now()}` };
    setItems((prev) => [...prev, withId]);
    setIsDirty(true);
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setIsDirty(true);
  };

  const handleAddGeneralItem = () => {
    const newKey = `CONSTANT_${generalItems.length + 1}`;
    const newItem: WorkspaceConstantItem = {
      id: `c_${Date.now()}`,
      key: newKey,
      scope: "General" as ConstantScope,
      dataType: "String" as ConstantDataType,
      value: "",
    };
    handleAddItem(newItem);
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(`$${key}`);
    setCopiedKey(key);
    toast.success(`Copied '$${key}'`);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleSaveAll = async () => {
    const seen = new Set<string>();
    for (const it of items) {
      const k = it.key.trim().toUpperCase();
      if (!k) continue;
      if (seen.has(k)) {
        toast.error(`Duplicate key '${k}'. Keys must be unique.`);
        return;
      }
      seen.add(k);
    }

    setIsSaving(true);
    try {
      await saveConstants(items);
      setIsDirty(false);
      toast.success("Workspace constants saved successfully!");
    } catch (err: any) {
      toast.error("Failed to save constants", { description: err?.message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Top Header */}
      <div className="h-14 border-b border-border/80 px-6 flex items-center justify-between shrink-0 bg-card/40">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onPress={onBackToCanvas}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Canvas</span>
          </Button>
          <div className="h-4 w-[1px] bg-border/60" />

          {/* Scope Mode Switcher */}
          <div className="flex items-center p-0.5 rounded-lg bg-muted/40 border border-border/60">
            <button
              onClick={() => setActiveTab("general")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "general"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <HardDrive className="h-3.5 w-3.5 text-emerald-400" />
              <span>General Constants ({generalItems.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("unreal")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                activeTab === "unreal"
                  ? "bg-background text-indigo-400 shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Gamepad2 className="h-3.5 w-3.5 text-indigo-400" />
              <span>Unreal Content Workspace ({unrealItems.length})</span>
            </button>
          </div>
        </div>

        {/* Right Action Bar */}
        <div className="flex items-center gap-2.5">
          {isDirty && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/10 text-xs">
              Unsaved Changes
            </Badge>
          )}

          <Button
            size="sm"
            onPress={handleSaveAll}
            isDisabled={isSaving}
            className={`gap-1.5 text-xs h-8 cursor-pointer ${
              isDirty
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                : "bg-primary text-primary-foreground"
            }`}
          >
            <Save className="h-3.5 w-3.5" />
            <span>{isSaving ? "Saving..." : "Save Changes"}</span>
          </Button>
        </div>
      </div>

      {/* Main Content View */}
      {activeTab === "unreal" ? (
        <UnrealContentVaultWorkspace
          projectId={projectId}
          workspaceRoot={rootPath}
          constants={items}
          onUpdateConstant={(up) => {
            setItems((prev) => prev.map((it) => (it.key === up.key ? up : it)));
            setIsDirty(true);
          }}
          onAddConstant={handleAddItem}
          onDeleteConstant={(key) => {
            setItems((prev) => prev.filter((it) => it.key !== key));
            setIsDirty(true);
          }}
        />
      ) : (
        <GeneralConstantsWorkspace
          items={generalItems}
          rootPath={rootPath}
          copiedKey={copiedKey}
          onCopyKey={handleCopyKey}
          onUpdateField={handleUpdateItemField}
          onAddItem={handleAddGeneralItem}
          onDeleteItem={handleDeleteItem}
        />
      )}
    </div>
  );
}
