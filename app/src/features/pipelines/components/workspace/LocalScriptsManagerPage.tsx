import { useMemo, useState } from "react";
import { Cpu, RefreshCw, Search, ArrowRightToLine, ArrowRightFromLine, FileCode2, ShieldCheck, Hash, Pencil, RotateCcw, Check, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocalNodeContractsQuery, useLocalPaletteQuery } from "../../hooks/workspace";
import type { NodePaletteItemDto } from "@/features/pipelines/types/pipelineGraphTypes";

interface LocalScriptsManagerPageProps {
  projectId: string;
  rootPath?: string | null;
  scriptsDir?: string;
  ignorePatterns?: string[];
  isScanning?: boolean;
  onSyncScripts?: () => Promise<void> | void;
}

export function LocalScriptsManagerPage({
  rootPath,
  scriptsDir,
  ignorePatterns,
  isScanning: isScanningExternal,
  onSyncScripts,
}: LocalScriptsManagerPageProps) {
  const { data: nodeContracts = [], isFetching, refetch } = useLocalNodeContractsQuery(rootPath ?? null);
  const { scanAndSyncScripts, isScanning: isScanningLocal } = useLocalPaletteQuery(
    rootPath ?? null,
    scriptsDir,
    ignorePatterns,
  );
  const isScanning = isScanningExternal || isScanningLocal;

  const [search, setSearch] = useState("");
  const [executorFilter, setExecutorFilter] = useState<string>("all");
  const [selectedRefId, setSelectedRefId] = useState<string | null>(null);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [pinLabel, setPinLabel] = useState("");
  const [pinDataType, setPinDataType] = useState("Text");
  const [pinDefault, setPinDefault] = useState("");
  const [isSavingPin, setIsSavingPin] = useState(false);

  const [isCheckingDiff, setIsCheckingDiff] = useState(false);
  const [scanDiff, setScanDiff] = useState<{
    added: string[];
    modified: string[];
    removed: string[];
  } | null>(null);

  const scriptNodes = useMemo(() => {
    return nodeContracts.filter((item) => {
      const kind = item.sourceRef?.kind ?? (item.source === "System" || item.source === "BuiltIn" ? "builtin" : undefined);
      const isConstant =
        item.viewVariant === "Constant" ||
        item.capabilities?.isConstantNode === true ||
        item.refId.startsWith("local:constant:");
      const isComponent =
        item.viewVariant === "Component" ||
        item.source === "SubPipeline" ||
        item.refId.startsWith("local:component:");
      return kind !== "builtin" && !isConstant && !isComponent;
    });
  }, [nodeContracts]);

  const executors = useMemo(() => {
    const set = new Set<string>();
    for (const item of scriptNodes) {
      if (item.executor) set.add(item.executor.toLowerCase());
    }
    return ["all", ...Array.from(set).sort()];
  }, [scriptNodes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scriptNodes.filter((item) => {
      if (executorFilter !== "all" && (item.executor || "").toLowerCase() !== executorFilter) {
        return false;
      }
      if (!q) return true;
      const name = (item.label || item.name || "").toLowerCase();
      const refId = (item.refId || "").toLowerCase();
      const desc = (item.description || "").toLowerCase();
      return name.includes(q) || refId.includes(q) || desc.includes(q);
    });
  }, [scriptNodes, search, executorFilter]);

  const selectedItem = useMemo(() => {
    if (filtered.length === 0) return null;
    if (selectedRefId) {
      const found = filtered.find((x) => x.refId === selectedRefId);
      if (found) return found;
    }
    return filtered[0];
  }, [filtered, selectedRefId]);

  const handleSync = async () => {
    if (onSyncScripts) {
      await onSyncScripts();
    } else if (rootPath) {
      await scanAndSyncScripts();
    }
    setScanDiff(null);
    await refetch();
  };

  const handleScanDiff = async () => {
    if (!rootPath) return;
    setIsCheckingDiff(true);
    try {
      const normalizedRoot = rootPath.replace(/[\\/]+$/, "");
      const subDir = (scriptsDir || "pipeline-scripts").replace(/^[\\/]+/, "");
      const scriptsFolder = `${normalizedRoot}/${subDir}`;
      const analyzed = await invoke<Array<{ refId: string; contentHash?: string }>>("analyze_local_scripts_native", {
        folders: [{ namespace: "local", path: scriptsFolder }],
        customIgnores: ignorePatterns || [],
      });

      const currentByRef = new Map<string, string>();
      for (const node of scriptNodes) {
        const hash = (node.sourceRef as any)?.contentHash || (node as any).contentHash || "";
        currentByRef.set(node.refId, hash);
      }

      const added: string[] = [];
      const modified: string[] = [];
      const seen = new Set<string>();
      for (const item of analyzed) {
        seen.add(item.refId);
        if (!currentByRef.has(item.refId)) {
          added.push(item.refId);
        } else if (item.contentHash && currentByRef.get(item.refId) !== item.contentHash) {
          modified.push(item.refId);
        }
      }
      const removed = Array.from(currentByRef.keys()).filter((id) => !seen.has(id));
      setScanDiff({ added, modified, removed });
    } catch (err: any) {
      toast.error(err?.message || "Failed to scan script changes.");
    } finally {
      setIsCheckingDiff(false);
    }
  };

  const startEditPin = (pin: any) => {
    setEditingPinId(pin.id);
    setPinLabel(pin.label || pin.id || "");
    setPinDataType(pin.dataType || pin.primitiveType || "Text");
    setPinDefault(pin.defaultValue != null ? String(pin.defaultValue) : "");
  };

  const handleSavePinOverride = async (pinId: string) => {
    if (!rootPath || !selectedItem) return;
    setIsSavingPin(true);
    try {
      const overridePayload = {
        pins: {
          [pinId]: {
            label: pinLabel.trim() || undefined,
            dataType: pinDataType,
            defaultValue: pinDefault !== "" ? pinDefault : undefined,
          },
        },
      };
      await invoke("save_script_override", {
        rootPath,
        scriptKey: selectedItem.refId,
        overrideJson: JSON.stringify(overridePayload),
      });
      setEditingPinId(null);
      await handleSync();
      toast.success(`Saved pin override for '${pinId}'.`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to save pin override.");
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleClearPinOverride = async (pinId: string) => {
    if (!rootPath || !selectedItem) return;
    setIsSavingPin(true);
    try {
      await invoke("clear_script_override", {
        rootPath,
        scriptKey: selectedItem.refId,
        pinId,
      });
      setEditingPinId(null);
      await handleSync();
      toast.success(`Reset pin override for '${pinId}'.`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to reset pin override.");
    } finally {
      setIsSavingPin(false);
    }
  };

  const getDataPins = (item: NodePaletteItemDto, dir: "in" | "out") => {
    const pins = dir === "in" ? (item.dataInputs ?? item.inputs ?? []) : (item.dataOutputs ?? item.outputs ?? []);
    return pins.filter((p: any) => p.kind !== "Exec" && p.id !== "exec_in" && p.id !== "exec_out");
  };

  const getExecPins = (item: NodePaletteItemDto, dir: "in" | "out") => {
    const explicit = dir === "in" ? item.execInputs : item.execOutputs;
    if (Array.isArray(explicit) && explicit.length > 0) return explicit;
    const raw = dir === "in" ? (item.inputs ?? []) : (item.outputs ?? []);
    return raw.filter((p: any) => p.kind === "Exec" || p.id === "exec_in" || p.id === "exec_out");
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card/30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
            <Cpu className="h-4.5 w-4.5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Workspace Scripts</h1>
            <p className="text-xs text-muted-foreground">
              Manage &amp; inspect Python/DCC script node contracts ({scriptNodes.length} scripts)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search scripts or pins..."
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onPress={handleScanDiff}
            isDisabled={isCheckingDiff || isScanning || isFetching}
            className="h-8 gap-1.5 text-xs"
          >
            <Search className={`h-3.5 w-3.5 ${isCheckingDiff ? "animate-pulse" : ""}`} />
            {isCheckingDiff ? "Scanning..." : "Scan Changes"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onPress={handleSync}
            isDisabled={isScanning || isFetching}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isScanning || isFetching ? "animate-spin text-emerald-500" : ""}`} />
            <span>Sync Scripts</span>
          </Button>
        </div>
      </div>

      {scanDiff && (
        <div className="px-6 py-2.5 border-b border-border/50 bg-primary/5 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">Scan Diff:</span>
            <Badge variant="secondary" className="text-[10px]">
              +{scanDiff.added.length} New
            </Badge>
            <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">
              ~{scanDiff.modified.length} Modified
            </Badge>
            <Badge variant="outline" className="text-[10px] border-rose-500/40 text-rose-500">
              -{scanDiff.removed.length} Removed
            </Badge>
            {scanDiff.added.length === 0 && scanDiff.modified.length === 0 && scanDiff.removed.length === 0 && (
              <span className="text-muted-foreground">Workspace scripts are up to date.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(scanDiff.added.length > 0 || scanDiff.modified.length > 0 || scanDiff.removed.length > 0) && (
              <Button size="sm" className="h-7 text-xs" onPress={handleSync} isDisabled={isScanning}>
                Apply Changes
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs" onPress={() => setScanDiff(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Executor Filter Bar */}
      <div className="flex items-center gap-1.5 px-6 py-2 border-b border-border/40 bg-muted/20 shrink-0 overflow-x-auto">
        {executors.map((exec) => (
          <button
            key={exec}
            type="button"
            onClick={() => setExecutorFilter(exec)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors cursor-pointer ${
              executorFilter === exec
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
            }`}
          >
            {exec}
          </button>
        ))}
      </div>

      {/* Master-Detail Split Pane */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left List */}
        <div className="w-80 border-r border-border/50 overflow-y-auto divide-y divide-border/40 shrink-0 bg-muted/5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center p-6">
              <FileCode2 className="h-7 w-7 text-muted-foreground/40 mb-2" />
              <p className="text-xs font-medium text-foreground">No scripts found</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Click &ldquo;Sync Scripts&rdquo; to scan your workspace.
              </p>
            </div>
          ) : (
            filtered.map((item) => {
              const isSelected = selectedItem?.refId === item.refId;
              const sourceKind = item.sourceRef?.kind || item.source || "workspace";
              return (
                <button
                  key={item.refId}
                  type="button"
                  onClick={() => setSelectedRefId(item.refId)}
                  className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-emerald-500/10 border-l-2 border-l-emerald-500"
                      : "hover:bg-muted/30 border-l-2 border-l-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {item.label || item.name}
                    </span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 uppercase shrink-0">
                      {item.executor || "python"}
                    </Badge>
                  </div>
                  <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                    {item.refId}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground/80">
                    <span className="capitalize">{sourceKind}</span>
                    <span>•</span>
                    <span>{getDataPins(item, "in").length} in / {getDataPins(item, "out").length} out</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Detail / Contract Editor */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedItem ? (
            <div className="max-w-3xl space-y-6">
              {/* Top Summary */}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-border/40">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">
                      {selectedItem.label || selectedItem.name}
                    </h2>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {selectedItem.executor || "python"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {selectedItem.sourceRef?.kind || selectedItem.source || "workspace"}
                    </Badge>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-1">
                    {selectedItem.refId}
                  </p>
                  {selectedItem.description && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {selectedItem.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Provenance & Content Hash */}
              <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  <span>Provenance &amp; Execution Identity</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Source Kind</span>
                    <span className="font-mono text-foreground">
                      {selectedItem.sourceRef?.kind || "workspace"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Content Hash (SHA-256)</span>
                    <span className="font-mono text-foreground flex items-center gap-1 truncate">
                      <Hash className="h-3 w-3 text-muted-foreground shrink-0" />
                      {(selectedItem.sourceRef as any)?.contentHash || (selectedItem as any).contentHash || "Local disk verified"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Exec Pins */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border/50 p-4 space-y-2">
                  <div className="text-xs font-semibold text-foreground">Exec Inputs</div>
                  <div className="space-y-1.5">
                    {getExecPins(selectedItem, "in").map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/20">
                        <span className="font-mono">{p.label || p.id}</span>
                        <Badge variant="outline" className="text-[10px]">Exec</Badge>
                      </div>
                    ))}
                    {getExecPins(selectedItem, "in").length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Pure / No exec input</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border/50 p-4 space-y-2">
                  <div className="text-xs font-semibold text-foreground">Exec Outputs</div>
                  <div className="space-y-1.5">
                    {getExecPins(selectedItem, "out").map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/20">
                        <span className="font-mono">{p.label || p.id}</span>
                        <Badge variant="outline" className="text-[10px]">Exec</Badge>
                      </div>
                    ))}
                    {getExecPins(selectedItem, "out").length === 0 && (
                      <p className="text-xs text-muted-foreground italic">Pure / No exec output</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Data Pins */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-border/50 p-4 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ArrowRightToLine className="h-3.5 w-3.5 text-sky-400" />
                    <span>Data Inputs ({getDataPins(selectedItem, "in").length})</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {getDataPins(selectedItem, "in").map((pin: any) => (
                      <div key={pin.id} className="py-2 space-y-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate">{pin.label || pin.id}</div>
                            <div className="text-[11px] font-mono text-muted-foreground truncate">{pin.id}</div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="secondary" className="text-[10px]">
                              {pin.dataType || pin.primitiveType || "String"}
                            </Badge>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onPress={() => (editingPinId === pin.id ? setEditingPinId(null) : startEditPin(pin))}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        {editingPinId === pin.id && (
                          <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                value={pinLabel}
                                onChange={(e) => setPinLabel(e.target.value)}
                                placeholder="Label"
                                className="h-7 text-xs"
                              />
                              <select
                                value={pinDataType}
                                onChange={(e) => setPinDataType(e.target.value)}
                                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                              >
                                {["Text", "Number", "Boolean", "File", "Directory", "Json", "Array"].map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </div>
                            <Input
                              value={pinDefault}
                              onChange={(e) => setPinDefault(e.target.value)}
                              placeholder="Default value (optional)"
                              className="h-7 text-xs font-mono"
                            />
                            <div className="flex items-center justify-end gap-1.5">
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onPress={() => handleClearPinOverride(pin.id)} isDisabled={isSavingPin}>
                                <RotateCcw className="h-3 w-3 mr-1" /> Reset
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onPress={() => setEditingPinId(null)} isDisabled={isSavingPin}>
                                <X className="h-3 w-3 mr-1" /> Cancel
                              </Button>
                              <Button size="sm" className="h-6 px-2 text-[11px]" onPress={() => handleSavePinOverride(pin.id)} isDisabled={isSavingPin}>
                                <Check className="h-3 w-3 mr-1" /> Save
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {getDataPins(selectedItem, "in").length === 0 && (
                      <p className="text-xs text-muted-foreground italic py-1">No data inputs</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-border/50 p-4 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ArrowRightFromLine className="h-3.5 w-3.5 text-amber-400" />
                    <span>Data Outputs ({getDataPins(selectedItem, "out").length})</span>
                  </div>
                  <div className="divide-y divide-border/40">
                    {getDataPins(selectedItem, "out").map((pin: any) => (
                      <div key={pin.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{pin.label || pin.id}</div>
                          <div className="text-[11px] font-mono text-muted-foreground truncate">{pin.id}</div>
                        </div>
                        <Badge variant="secondary" className="text-[10px] shrink-0">
                          {pin.dataType || pin.primitiveType || "String"}
                        </Badge>
                      </div>
                    ))}
                    {getDataPins(selectedItem, "out").length === 0 && (
                      <p className="text-xs text-muted-foreground italic py-1">No data outputs</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <FileCode2 className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium text-foreground">Select a script to inspect</p>
              <p className="text-xs mt-1">Choose a script from the left list to view its Exec/Data pins and hash provenance.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
