import { useMemo, useState } from "react";
import { Cpu, RefreshCw, Search, ArrowRightToLine, ArrowRightFromLine, FileCode2 } from "lucide-react";
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

  const scriptNodes = useMemo(() => {
    return nodeContracts.filter((item) => {
      const kind = item.sourceRef?.kind ?? (item.source === "System" || item.source === "BuiltIn" ? "builtin" : undefined);
      const isConstant =
        item.viewVariant === "Constant" ||
        item.capabilities?.viewVariant === "Constant" ||
        item.capabilities?.isConstantNode === true;
      if (isConstant || kind === "builtin") return false;
      return true;
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
      return (
        (item.name || "").toLowerCase().includes(q) ||
        (item.label || "").toLowerCase().includes(q) ||
        (item.refId || "").toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q)
      );
    });
  }, [scriptNodes, executorFilter, search]);

  const handleSync = async () => {
    if (onSyncScripts) {
      await onSyncScripts();
    } else {
      await scanAndSyncScripts();
    }
    await refetch();
  };

  const getPins = (item: NodePaletteItemDto, dir: "in" | "out") => {
    const raw = dir === "in" ? (item.dataInputs ?? item.inputs ?? []) : (item.dataOutputs ?? item.outputs ?? []);
    return raw.filter((p: any) => p.kind !== "Exec" && p.kind !== 1 && p.id !== "exec_in" && p.id !== "exec_out");
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border/60 bg-card/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <Cpu className="h-4.5 w-4.5 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Workspace Scripts</h2>
              <Badge variant="outline" className="text-[11px] font-mono">
                {scriptNodes.length}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Scanned Python &amp; DCC script nodes available in this workspace
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

      <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-border/40 bg-muted/20 shrink-0 overflow-x-auto">
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
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-border/60 rounded-xl bg-muted/10 p-6">
            <FileCode2 className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm font-medium text-foreground">No scripts found</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Click &ldquo;Sync Scripts&rdquo; to scan your workspace scripts directory or adjust your search filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((item) => {
              const inPins = getPins(item, "in");
              const outPins = getPins(item, "out");
              const sourceKind = item.sourceRef?.kind || item.source || "workspace";

              return (
                <div
                  key={item.refId}
                  className="flex flex-col justify-between rounded-xl border border-border/60 bg-card/50 p-4 hover:border-emerald-500/40 transition-colors"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold text-foreground truncate">
                          {item.label || item.name}
                        </h3>
                        <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
                          {item.refId}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.executor && (
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {item.executor}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] capitalize text-muted-foreground">
                          {String(sourceKind)}
                        </Badge>
                      </div>
                    </div>

                    {item.description && (
                      <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>

                  {(inPins.length > 0 || outPins.length > 0) && (
                    <div className="mt-3 pt-3 border-t border-border/40 space-y-1.5">
                      {inPins.length > 0 && (
                        <div className="flex items-start gap-1.5 text-[10px]">
                          <ArrowRightToLine className="h-3 w-3 text-sky-400 shrink-0 mt-0.5" />
                          <div className="flex flex-wrap gap-1">
                            {inPins.map((p: any) => (
                              <span
                                key={p.id}
                                className="px-1.5 py-0.5 rounded bg-muted/60 text-foreground/90 font-mono"
                              >
                                {p.label || p.id}: {p.dataType || p.primitiveType || "String"}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {outPins.length > 0 && (
                        <div className="flex items-start gap-1.5 text-[10px]">
                          <ArrowRightFromLine className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                          <div className="flex flex-wrap gap-1">
                            {outPins.map((p: any) => (
                              <span
                                key={p.id}
                                className="px-1.5 py-0.5 rounded bg-muted/60 text-foreground/90 font-mono"
                              >
                                {p.label || p.id}: {p.dataType || p.primitiveType || "String"}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
