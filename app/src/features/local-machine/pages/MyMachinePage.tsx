import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  FileCode2,
  FolderOpen,
  KeyRound,
  Plus,
  RefreshCw,
  Save,
  ScanSearch,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ExecutorIcon } from "@/features/runners/components/ExecutorIcon";
import {
  SUPPORTED_EXECUTOR_KEYS,
  getSoftwareMetadata,
} from "@/features/runners/constants/dccEngines";
import {
  getLocalMachineInfo,
  isTauriRuntime,
  openNativeFileOrFolderDialog,
  type LocalMachineInfo,
} from "@/lib/platform/filePickerStrategy";

interface LocalRunnerConfigDto {
  configPath: string;
  exists: boolean;
  runnerId?: string | null;
  name?: string | null;
  runnerExecutable: string;
  executors: Record<string, string>;
  env: Record<string, string>;
}

interface LocalDccAppDto {
  name: string;
  version: string;
  path: string;
}

interface LocalDccScanResultDto {
  runnerExecutable: string;
  blender: LocalDccAppDto[];
  unreal: LocalDccAppDto[];
  python: LocalDccAppDto[];
}

interface EnvEntryRow {
  id: string;
  key: string;
  value: string;
}

function recordToEnvRows(env: Record<string, string>): EnvEntryRow[] {
  return Object.entries(env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value], idx) => ({
      id: `${idx}-${key}`,
      key,
      value,
    }));
}

export function MyMachinePage() {
  const isDesktop = isTauriRuntime();
  const [machineInfo, setMachineInfo] = useState<LocalMachineInfo | null>(null);
  const [configDto, setConfigDto] = useState<LocalRunnerConfigDto | null>(null);
  const [executors, setExecutors] = useState<Record<string, string>>({});
  const [envRows, setEnvRows] = useState<EnvEntryRow[]>([]);
  const [scanResult, setScanResult] = useState<LocalDccScanResultDto | null>(null);

  const [newEnvKey, setNewEnvKey] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");
  const [revealedEnvIds, setRevealedEnvIds] = useState<Record<string, boolean>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const loadConfig = async () => {
    if (!isDesktop) return;
    setIsLoading(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const [info, cfg] = await Promise.all([
        getLocalMachineInfo(),
        invoke<LocalRunnerConfigDto>("get_local_runner_config", {
          workspaceRoot: null,
        }),
      ]);
      setMachineInfo(info);
      setConfigDto(cfg);
      setExecutors(cfg.executors || {});
      setEnvRows(recordToEnvRows(cfg.env || {}));
      setIsDirty(false);
    } catch (err: any) {
      toast.error("Failed to load local runner configuration", {
        description: err?.message || String(err),
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, [isDesktop]);

  const handleScanDccs = async () => {
    if (!isDesktop) return;
    setIsScanning(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<LocalDccScanResultDto>(
        "scan_local_dcc_executors",
      );
      setScanResult(result);

      const totalFound =
        result.blender.length + result.unreal.length + result.python.length;
      toast.success("Local DCC scan completed", {
        description: `Detected ${totalFound} executable(s) across Blender, Unreal Engine, and Python.`,
      });
    } catch (err: any) {
      toast.error("Failed to scan local DCC installations", {
        description: err?.message || String(err),
      });
    } finally {
      setIsScanning(false);
    }
  };

  const handleSave = async () => {
    if (!isDesktop) return;
    setIsSaving(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      const cleanExecutors: Record<string, string> = {};
      for (const [k, v] of Object.entries(executors)) {
        const trimmed = v.trim();
        if (trimmed) {
          cleanExecutors[k.trim().toLowerCase()] = trimmed;
        }
      }

      const cleanEnv: Record<string, string> = {};
      for (const row of envRows) {
        const k = row.key.trim();
        if (k) {
          cleanEnv[k] = row.value;
        }
      }

      const updated = await invoke<LocalRunnerConfigDto>(
        "save_local_runner_config",
        {
          workspaceRoot: null,
          executors: cleanExecutors,
          env: cleanEnv,
        },
      );

      setConfigDto(updated);
      setExecutors(updated.executors || {});
      setEnvRows(recordToEnvRows(updated.env || {}));
      setIsDirty(false);
      toast.success("Configuration saved to runner.toml", {
        description: updated.configPath,
      });
    } catch (err: any) {
      toast.error("Failed to save configuration", {
        description: err?.message || String(err),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBrowseExecutor = async (executorKey: string) => {
    try {
      const meta = getSoftwareMetadata(executorKey);
      const selected = await openNativeFileOrFolderDialog({
        mode: "file",
        title: `Select ${meta.name} Executable`,
        extensions: ["exe", "cmd", "bat", "sh"],
      });
      if (selected) {
        setExecutors((prev) => ({ ...prev, [executorKey]: selected }));
        setIsDirty(true);
      }
    } catch (err: any) {
      toast.error("Failed to open file picker", {
        description: err?.message || String(err),
      });
    }
  };

  const handleSetExecutor = (executorKey: string, value: string) => {
    setExecutors((prev) => ({ ...prev, [executorKey]: value }));
    setIsDirty(true);
  };

  const handleAddEnvRow = () => {
    const trimmedKey = newEnvKey.trim();
    if (!trimmedKey) {
      toast.error("Environment variable key is required");
      return;
    }
    setEnvRows((prev) => {
      const existingIdx = prev.findIndex((r) => r.key === trimmedKey);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = { ...next[existingIdx], value: newEnvValue };
        return next;
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${trimmedKey}`,
          key: trimmedKey,
          value: newEnvValue,
        },
      ];
    });
    setNewEnvKey("");
    setNewEnvValue("");
    setIsDirty(true);
  };

  const executorKeys = useMemo(() => {
    const keys = new Set<string>(SUPPORTED_EXECUTOR_KEYS);
    for (const key of Object.keys(executors)) {
      if (key) keys.add(key);
    }
    return Array.from(keys);
  }, [executors]);

  const detectedByKey = (key: string): LocalDccAppDto[] => {
    if (!scanResult) return [];
    if (key === "blender") return scanResult.blender;
    if (key === "unreal") return scanResult.unreal;
    if (key === "python") return scanResult.python;
    return [];
  };

  if (!isDesktop) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="size-4 text-muted-foreground" />
              My Machine & Local Runner Config
            </CardTitle>
            <CardDescription>
              Local DCC scanning and runner.toml configuration are available in the Forgity Desktop app.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto page-container space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">
              My Machine & DCC Config
            </h1>
            {isDirty && (
              <Badge variant="outline" className="text-amber-500 border-amber-500/40">
                Unsaved changes
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Configure local DCC executable overrides and environment variables for offline pipeline execution.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onPress={handleScanDccs}
            isDisabled={isScanning || isLoading}
          >
            <ScanSearch className={isScanning ? "animate-pulse" : ""} />
            <span>{isScanning ? "Scanning..." : "Scan Local DCCs"}</span>
          </Button>
          <Button
            variant="outline"
            onPress={loadConfig}
            isDisabled={isLoading || isSaving}
          >
            <RefreshCw className={isLoading ? "animate-spin" : ""} />
            <span>Reload</span>
          </Button>
          <Button
            onPress={handleSave}
            isDisabled={isSaving || isLoading || !isDirty}
          >
            <Save />
            <span>{isSaving ? "Saving..." : "Save Configuration"}</span>
          </Button>
        </div>
      </div>

      {/* Workstation & Runner File Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileCode2 className="size-4 text-emerald-500" />
            Local Runner Environment
          </CardTitle>
          <CardDescription>
            Workstation hardware identity and configuration file loaded by forgity-runner.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-xs sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <div className="text-muted-foreground">Workstation</div>
            <div className="font-medium text-sm">
              {machineInfo?.hostname || "Local Desktop"}
            </div>
            <div className="font-mono text-[11px] text-muted-foreground truncate">
              Key: {machineInfo?.machineKey || "..."}
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">runner.toml</span>
              {configDto?.exists ? (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <CheckCircle2 className="size-3 text-emerald-500" />
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  Created on Save
                </Badge>
              )}
            </div>
            <div className="font-mono text-[11px] break-all">
              {configDto?.configPath || "Loading..."}
            </div>
            {configDto?.runnerExecutable && (
              <div className="font-mono text-[11px] text-muted-foreground truncate">
                Runner: {configDto.runnerExecutable}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* DCC Executables */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Cpu className="size-4 text-primary" />
            DCC & Runtime Executables
          </CardTitle>
          <CardDescription>
            Leave an executor empty to auto-detect it at runtime, or pin a specific version path.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {executorKeys.map((key, idx) => {
            const meta = getSoftwareMetadata(key);
            const value = executors[key] ?? "";
            const detected = detectedByKey(key);

            return (
              <div key={key} className="space-y-2.5">
                {idx > 0 && <Separator className="my-2" />}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ExecutorIcon executor={key} className="size-4" />
                    <span className="text-sm font-medium">{meta.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {key}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {value.trim() ? "Pinned override" : "Auto-detect"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    value={value}
                    onChange={(e) => handleSetExecutor(key, e.target.value)}
                    placeholder={`Auto-detect ${meta.name} executable path...`}
                    className="font-mono text-xs flex-1"
                  />
                  <Button
                    variant="outline"
                    onPress={() => handleBrowseExecutor(key)}
                  >
                    <FolderOpen />
                    <span>Browse</span>
                  </Button>
                  {value.trim() && (
                    <Button
                      variant="ghost"
                      onPress={() => handleSetExecutor(key, "")}
                    >
                      Clear
                    </Button>
                  )}
                </div>

                {detected.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] text-muted-foreground mr-1">
                      Detected:
                    </span>
                    {detected.map((item) => {
                      const isSelected = value.trim() === item.path.trim();
                      return (
                        <button
                          key={item.path}
                          type="button"
                          onClick={() => handleSetExecutor(key, item.path)}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] transition-colors cursor-pointer ${isSelected
                              ? "border-primary bg-primary/10 text-primary font-medium"
                              : "border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                          title={item.path}
                        >
                          <span>{item.name}</span>
                          {item.version && (
                            <span className="opacity-75">v{item.version}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Environment Variables [env] */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="size-4 text-amber-500" />
            Runner Environment Variables ([env])
          </CardTitle>
          <CardDescription>
            Injected automatically into Python, Blender, and Unreal pipeline stages during local execution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {envRows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
              No custom environment variables configured yet. Add API keys (e.g. OPENAI_API_KEY, GEMINI_API_KEY) or pipeline flags below.
            </div>
          ) : (
            <div className="space-y-2">
              {envRows.map((row) => {
                const isRevealed = Boolean(revealedEnvIds[row.id]);
                return (
                  <div key={row.id} className="flex items-center gap-2">
                    <Input
                      value={row.key}
                      onChange={(e) => {
                        const nextKey = e.target.value;
                        setEnvRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, key: nextKey } : r,
                          ),
                        );
                        setIsDirty(true);
                      }}
                      placeholder="KEY_NAME"
                      className="font-mono text-xs w-56 shrink-0"
                    />
                    <Input
                      type={isRevealed ? "text" : "password"}
                      value={row.value}
                      onChange={(e) => {
                        const nextVal = e.target.value;
                        setEnvRows((prev) =>
                          prev.map((r) =>
                            r.id === row.id ? { ...r, value: nextVal } : r,
                          ),
                        );
                        setIsDirty(true);
                      }}
                      placeholder="Value"
                      className="font-mono text-xs flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={isRevealed ? "Hide value" : "Show value"}
                      onPress={() =>
                        setRevealedEnvIds((prev) => ({
                          ...prev,
                          [row.id]: !prev[row.id],
                        }))
                      }
                    >
                      {isRevealed ? <EyeOff /> : <Eye />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove variable"
                      onPress={() => {
                        setEnvRows((prev) =>
                          prev.filter((r) => r.id !== row.id),
                        );
                        setIsDirty(true);
                      }}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newEnvKey}
              onChange={(e) => setNewEnvKey(e.target.value)}
              placeholder="New variable key (e.g. GEMINI_API_KEY)"
              className="font-mono text-xs w-64"
            />
            <Input
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
              placeholder="Value"
              className="font-mono text-xs flex-1 min-w-48"
            />
            <Button variant="outline" onPress={handleAddEnvRow}>
              <Plus />
              <span>Add Variable</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
