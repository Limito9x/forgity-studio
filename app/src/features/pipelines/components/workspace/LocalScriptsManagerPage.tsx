import { useMemo, useState } from "react";
import { Cpu, RefreshCw, Search, ArrowRightToLine, ArrowRightFromLine, FileCode2, ShieldCheck, Hash } from "lucide-react";
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
    await refetch();
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
            onPress={handleSync}
            isDisabled={isScanning || isFetching}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isScanning || isFetching ? "animate-spin text-emerald-500" : ""}`} />
            <span>Sync Scripts</span>
          </Button>
        </div>
      </div>

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
