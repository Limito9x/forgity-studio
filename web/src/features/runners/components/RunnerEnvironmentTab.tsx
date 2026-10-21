import { useState, useEffect, useMemo } from "react";
import { useRunnerEnv, useUpdateRunnerEnv } from "../hooks/useRunnerEnv";
import { useDialogStore } from "@/stores/dialogStore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  FileText,
  AlertTriangle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RunnerEnvironmentTabProps {
  runnerId: string;
  runnerName: string;
  isOnline: boolean;
}

interface EnvRowItem {
  id: string;
  key: string;
  value: string;
  isMasked: boolean;
  isNew?: boolean;
}

function isLikelySecret(key: string): boolean {
  const upper = key.toUpperCase();
  return (
    upper.includes("KEY") ||
    upper.includes("SECRET") ||
    upper.includes("TOKEN") ||
    upper.includes("PASSWORD") ||
    upper.includes("AUTH")
  );
}

export function RunnerEnvironmentTab({
  runnerId,
  runnerName,
  isOnline,
}: RunnerEnvironmentTabProps) {
  const { data: envMap = {}, isLoading, isFetching, refetch } = useRunnerEnv(runnerId, isOnline);
  const { updateEnv, isPending: isSaving } = useUpdateRunnerEnv(runnerId);
  const openDialog = useDialogStore((state) => state.openDialog);

  const [rows, setRows] = useState<EnvRowItem[]>([]);
  const [initialKeys, setInitialKeys] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sync initial query data into local editable state
  useEffect(() => {
    if (envMap) {
      const keys = Object.keys(envMap).sort();
      const mappedRows: EnvRowItem[] = keys.map((k) => ({
        id: k,
        key: k,
        value: envMap[k] || "",
        isMasked: isLikelySecret(k),
      }));
      setRows(mappedRows);
      setInitialKeys(new Set(keys));
    }
  }, [envMap]);

  // Compute dirty/modified status
  const isDirty = useMemo(() => {
    const currentKeys = new Set(rows.map((r) => r.key.trim()).filter(Boolean));

    // Keys deleted?
    for (const k of initialKeys) {
      if (!currentKeys.has(k)) return true;
    }

    // New keys or modified values?
    for (const r of rows) {
      const trimmedKey = r.key.trim();
      if (!trimmedKey) continue;
      if (!initialKeys.has(trimmedKey)) return true;
      if (envMap[trimmedKey] !== r.value) return true;
    }

    return false;
  }, [rows, initialKeys, envMap]);

  // Actions
  const handleAddRow = () => {
    const newId = `new_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setRows((prev) => [
      ...prev,
      {
        id: newId,
        key: "",
        value: "",
        isMasked: false,
        isNew: true,
      },
    ]);
  };

  const handleUpdateRow = (id: string, field: "key" | "value", val: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (field === "key") {
          // Normalize key: uppercase, no spaces
          const normalized = val.replace(/\s+/g, "_").toUpperCase();
          const shouldMask = isLikelySecret(normalized);
          return { ...r, key: normalized, isMasked: r.isNew ? shouldMask : r.isMasked };
        }
        return { ...r, [field]: val };
      })
    );
  };

  const handleDeleteRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleToggleMask = (id: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isMasked: !r.isMasked } : r))
    );
  };

  const handleCopyValue = async (id: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      toast.success("Value copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleOpenBulkImport = () => {
    openDialog("bulk-import-runner-env", {
      onImport: (importedItems) => {
        setRows((prev) => {
          const merged = [...prev];
          for (const item of importedItems) {
            const existingIdx = merged.findIndex((r) => r.key === item.key);
            if (existingIdx >= 0) {
              merged[existingIdx] = { ...merged[existingIdx], value: item.value };
            } else {
              merged.push({
                id: `bulk_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                key: item.key,
                value: item.value,
                isMasked: isLikelySecret(item.key),
                isNew: true,
              });
            }
          }
          return merged;
        });
      },
    });
  };

  const handleSave = async () => {
    if (!runnerId) return;

    // Validate duplicate keys
    const seen = new Set<string>();
    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue;
      if (seen.has(k)) {
        toast.error(`Duplicate environment key found: ${k}`);
        return;
      }
      seen.add(k);
    }

    // Build payload
    const finalEnv: Record<string, string> = {};
    const currentKeySet = new Set<string>();

    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue;
      finalEnv[k] = r.value;
      currentKeySet.add(k);
    }

    const removeKeys: string[] = [];
    for (const oldKey of initialKeys) {
      if (!currentKeySet.has(oldKey)) {
        removeKeys.push(oldKey);
      }
    }

    try {
      await updateEnv({
        env: finalEnv,
        removeKeys: removeKeys.length > 0 ? removeKeys : undefined,
      });
      toast.success("Environment variables synced to runner.toml successfully!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update runner environment variables");
    }
  };

  return (
    <div className="space-y-6">
      {/* Offline Alert Banner */}
      {!isOnline && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
          <AlertTriangle className="size-4 shrink-0" />
          <div className="flex-1">
            <span className="font-semibold">Workstation is currently Offline.</span> Environment
            variables cannot be queried or updated real-time until the runner daemon is running.
          </div>
        </div>
      )}

      {/* Main Card */}
      <Card className="border border-border/80 bg-card shadow-xs">
        <CardHeader className="pb-4 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <KeyRound className="size-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-bold text-foreground">
                      Environment Variables
                    </CardTitle>
                    <Badge variant="secondary" className="font-mono text-[10px] px-2 py-0">
                      [env]
                    </Badge>
                    {isDirty && (
                      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px] px-2 py-0">
                        Unsaved Changes
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Managed in <code className="font-mono text-[10px] text-foreground">runner.toml</code>. Automatically injected into Python, Unreal Engine & Blender subprocesses via <code className="font-mono text-[10px] text-foreground">os.environ</code>.
                  </p>
                </div>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onPress={() => refetch()}
                isDisabled={isLoading || isFetching || !isOnline}
                className="gap-1.5 cursor-pointer text-xs h-8 px-2.5"
                aria-label="Refresh environment variables"
              >
                <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
                <span>Refresh</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onPress={handleOpenBulkImport}
                className="gap-1.5 cursor-pointer text-xs h-8 px-2.5"
                aria-label="Bulk import .env"
              >
                <FileText className="size-3.5" />
                <span>Paste .env</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onPress={handleAddRow}
                className="gap-1.5 cursor-pointer text-xs h-8 px-2.5"
                aria-label="Add new environment variable"
              >
                <Plus className="size-3.5" />
                <span>Add Variable</span>
              </Button>

              <Button
                size="sm"
                onPress={handleSave}
                isDisabled={!isDirty || isSaving || !isOnline}
                className={cn(
                  "gap-1.5 cursor-pointer text-xs h-8 px-3 font-medium transition-all",
                  isDirty
                    ? "bg-primary text-primary-foreground shadow-sm hover:opacity-90"
                    : "opacity-60"
                )}
                aria-label="Save environment variables"
              >
                {isSaving ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                <span>{isSaving ? "Applying..." : "Save Changes"}</span>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2.5 text-muted-foreground text-xs">
              <RefreshCw className="size-5 animate-spin text-primary" />
              <span>Querying workstation environment via gRPC...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 border border-dashed border-border/80 rounded-xl flex flex-col items-center justify-center gap-3 text-center px-4">
              <div className="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <KeyRound className="size-5" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  No Environment Variables Configured
                </p>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Add custom keys like <code className="font-mono text-primary font-semibold">GEMINI_API_KEY</code>, <code className="font-mono text-primary font-semibold">OPENAI_API_KEY</code>, or DCC directories to make them available across all pipeline tools.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onPress={handleAddRow}
                  className="gap-1.5 text-xs h-8 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>Add First Variable</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={handleOpenBulkImport}
                  className="gap-1.5 text-xs h-8 cursor-pointer"
                >
                  <FileText className="size-3.5" />
                  <span>Bulk Paste (.env)</span>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Table Column Headers */}
              <div className="grid grid-cols-12 gap-3 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                <div className="col-span-12 sm:col-span-4">Variable Key</div>
                <div className="col-span-12 sm:col-span-7">Value</div>
                <div className="hidden sm:block sm:col-span-1 text-right">Action</div>
              </div>

              {/* Rows List */}
              <div className="space-y-2">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-12 gap-2.5 items-center p-2 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                  >
                    {/* Key Input */}
                    <div className="col-span-12 sm:col-span-4">
                      <Input
                        value={row.key}
                        onChange={(e) => handleUpdateRow(row.id, "key", e.target.value)}
                        placeholder="KEY_NAME (e.g. GEMINI_API_KEY)"
                        className="font-mono text-xs h-8.5 uppercase bg-background"
                        aria-label="Variable Name"
                      />
                    </div>

                    {/* Value Input with Eye & Copy toggles */}
                    <div className="col-span-10 sm:col-span-7 relative flex items-center">
                      <Input
                        type={row.isMasked ? "password" : "text"}
                        value={row.value}
                        onChange={(e) => handleUpdateRow(row.id, "value", e.target.value)}
                        placeholder="Value"
                        className="font-mono text-xs h-8.5 pr-16 bg-background"
                        aria-label="Variable Value"
                      />

                      <div className="absolute right-1.5 flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          onPress={() => handleToggleMask(row.id)}
                          className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
                          aria-label={row.isMasked ? "Show value" : "Hide value"}
                        >
                          {row.isMasked ? (
                            <Eye className="size-3.5" />
                          ) : (
                            <EyeOff className="size-3.5" />
                          )}
                        </Button>

                        <Button
                          variant="ghost"
                          size="icon"
                          onPress={() => handleCopyValue(row.id, row.value)}
                          className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
                          aria-label="Copy value"
                        >
                          {copiedId === row.id ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Delete Action Button */}
                    <div className="col-span-2 sm:col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onPress={() => handleDeleteRow(row.id)}
                        className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer transition-colors"
                        aria-label={`Delete ${row.key || "variable"}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Quick Tips */}
              <div className="pt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Info className="size-3 text-muted-foreground" />
                  Changes take effect on the next pipeline stage run without restarting the runner.
                </span>
                <span className="font-mono">{rows.length} variable(s)</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
