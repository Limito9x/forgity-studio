import { useState, useMemo } from "react";
import {
  PackagePlus,
  ArrowLeft,
  Plus,
  X,
  Workflow,
  Layers,
  KeyRound,
  FileCode,
  FolderArchive,
  Save,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCreateTemplateContainer } from "@/gen/endpoints/templates/templates";
import { useIngestCloudDataManifest } from "@/gen/endpoints/cloud-data/cloud-data";
import {
  loadLocalNodeContracts,
  useLocalWorkspaceConfig,
  useLocalPipelinesQuery,
} from "@/features/pipelines/hooks/workspace";
import type { ScannedPipelineYamlItemRust } from "@/features/pipelines/types/workspaceConfig";
import type { NodePaletteItemDto, PaletteNodeSourceRef } from "@/features/pipelines/types/pipelineGraphTypes";
import { uploadMultipleAssetsFlow } from "@/lib/upload-utils";
import {
  useTemplateDependencyScan,
  type TemplateDependencyManifest,
  type ManifestDiagnostic,
} from "../../hooks/useTemplateDependencyScan";

interface TemplateItemSelect {
  id: string;
  slug: string;
  name: string;
  relativePath: string;
  graphHash?: string;
}

interface ConstantConfigItem {
  key: string;
  label: string;
  dataType: string;
  scope: string;
  isRequired: boolean;
  defaultValue?: string;
  description?: string;
}

interface ScriptItem {
  id: string;
  name: string;
  path: string;
  executor: string;
  contentHash: string;
}

interface AssetItem {
  name: string;
  relativePath?: string;
  sizeBytes?: number;
  hash?: string;
}

interface TemplateContainerBuilderProps {
  onBack: () => void;
  onSuccess: () => void;
}

type JsonRecord = Record<string, unknown>;

interface TemplateGraphSnapshot {
  slug: string;
  graphHash: string;
  dagBundleJson: JsonRecord;
  contractsJson: JsonRecord;
}

interface LocalFilePinCandidate {
  key: string;
  nodeId: string;
  node: JsonRecord;
  pinId: string;
  filePath: string;
  fileName: string;
}

interface UploadedTemplatePinAsset {
  name: string;
  relativePath: string;
  belongsToNodeId: string;
  belongsToPinId: string;
  sizeBytes: number;
  assetId: string;
  downloadUrl: string;
  sha256: string;
}

function slugifyTemplateName(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "template";
}

async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const hashBuffer = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getGraphNodes(graph: JsonRecord): JsonRecord[] {
  const rootGraph = isRecord(graph.rootPipeline) ? graph.rootPipeline : graph;
  const graphRecords = [rootGraph];
  const components = isRecord(graph.components) ? graph.components : {};

  for (const component of Object.values(components)) {
    if (isRecord(component)) graphRecords.push(component);
  }

  return graphRecords.flatMap((record) =>
    Array.isArray(record.nodes) ? record.nodes.filter(isRecord) : []
  );
}

function getFileName(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function isAbsoluteLocalPath(path: string): boolean {
  return path.startsWith("/") || path.startsWith("\\\\") || /^[A-Za-z]:[\\/]/.test(path);
}

function isLocalPathValue(path: string): boolean {
  const hasUriScheme = /^[a-z][a-z\d+.-]*:/i.test(path);
  return !hasUriScheme || /^[A-Za-z]:[\\/]/.test(path);
}

function collectLocalFilePins(
  graphs: TemplateGraphSnapshot[],
  paletteItems: NodePaletteItemDto[]
): LocalFilePinCandidate[] {
  const paletteByRefId = new Map(paletteItems.map((item) => [item.refId, item]));
  const candidates: LocalFilePinCandidate[] = [];

  for (const graph of graphs) {
    for (const node of getGraphNodes(graph.dagBundleJson)) {
      const configValues = isRecord(node.configValues) ? node.configValues : {};
      const nodeInputs = Array.isArray(node.dataInputs)
        ? node.dataInputs.filter(isRecord)
        : Array.isArray(node.inputs)
          ? node.inputs.filter(isRecord)
          : [];
      const nodeDefinition =
        typeof node.refId === "string" ? paletteByRefId.get(node.refId) : undefined;
      const defInputs = nodeDefinition?.dataInputs ?? nodeDefinition?.inputs ?? [];
      const pins = nodeInputs.length > 0 ? nodeInputs : defInputs;
      const nodeId =
        typeof node.id === "string"
          ? node.id
          : typeof node.refId === "string"
            ? node.refId
            : null;

      for (const pin of pins) {
        if (!isRecord(pin)) continue;
        const primitive = typeof pin.primitiveType === "string" ? pin.primitiveType : undefined;
        const pinType =
          typeof pin.dataType === "string"
            ? pin.dataType
            : primitive ?? pin.type;
        const isFilePin =
          primitive === "File" ||
          primitive === "FilePath" ||
          pinType === "File" ||
          pinType === "FilePath" ||
          pinType === "Asset";
        if (!isFilePin) continue;

        const pinId =
          typeof pin.id === "string" && pin.id
            ? pin.id
            : typeof pin.name === "string"
              ? pin.name
              : null;
        if (!pinId || !nodeId) continue;

        const value = configValues[pinId];
        if (typeof value !== "string" || !value.trim()) continue;

        let resolvedLocalPath: string | null = null;
        if (value.startsWith("workspace://assets/")) {
          const relName = value.slice("workspace://assets/".length);
          if (relName) {
            resolvedLocalPath = `assets/${relName}`;
          }
        } else if (
          isLocalPathValue(value) &&
          (value.includes("/") || value.includes("\\") || value.startsWith("."))
        ) {
          resolvedLocalPath = value;
        }

        if (!resolvedLocalPath) continue;

        candidates.push({
          key: `${graph.slug}:${nodeId}:${pinId}`,
          nodeId,
          node,
          pinId,
          filePath: resolvedLocalPath,
          fileName: getFileName(resolvedLocalPath),
        });
      }
    }
  }

  return candidates;
}

async function uploadLocalFilePins(
  graphs: TemplateGraphSnapshot[],
  rootPath: string,
  paletteItems: NodePaletteItemDto[]
): Promise<UploadedTemplatePinAsset[]> {
  const candidates = collectLocalFilePins(graphs, paletteItems);
  if (candidates.length === 0) return [];

  const { readFile } = await import("@tauri-apps/plugin-fs");
  const { join } = await import("@tauri-apps/api/path");
  const shaByKey = new Map<string, string>();
  const sizeByKey = new Map<string, number>();
  const uploadItems = await Promise.all(
    candidates.map(async (candidate) => {
      const filePath = isAbsoluteLocalPath(candidate.filePath)
        ? candidate.filePath
        : await join(rootPath, candidate.filePath);
      const contents = await readFile(filePath);
      if (contents.byteLength === 0) {
        throw new Error(`File pin "${candidate.fileName}" is empty and cannot be uploaded.`);
      }
      shaByKey.set(candidate.key, await sha256Hex(contents));
      sizeByKey.set(candidate.key, contents.byteLength);
      return {
        key: candidate.key,
        file: new File([contents], candidate.fileName),
      };
    })
  );

  const uploadedAssets = await uploadMultipleAssetsFlow(uploadItems);
  const assetsByKey = new Map(uploadedAssets.map((asset) => [asset.key, asset]));
  const uploadedPinAssets: UploadedTemplatePinAsset[] = [];

  for (const candidate of candidates) {
    const asset = assetsByKey.get(candidate.key);
    if (!asset?.publicUrl) {
      throw new Error(`Cloud upload did not return a public URL for "${candidate.fileName}".`);
    }
    const sha256 = shaByKey.get(candidate.key) ?? "";

    const configValues = isRecord(candidate.node.configValues)
      ? candidate.node.configValues
      : {};
    candidate.node.configValues = {
      ...configValues,
      [candidate.pinId]: {
        kind: "template_asset",
        assetId: asset.assetId,
        fileName: candidate.fileName,
        originalName: candidate.fileName,
        sha256,
        publicUrl: asset.publicUrl,
        url: asset.publicUrl,
        filename: candidate.fileName,
      },
    };

    const fileAssets = isRecord(candidate.node.fileAssets)
      ? candidate.node.fileAssets
      : {};
    candidate.node.fileAssets = {
      ...fileAssets,
      [candidate.pinId]: {
        id: asset.assetId,
        name: candidate.fileName,
        originalName: candidate.fileName,
        sha256,
        sizeBytes: asset.asset.size,
        contentType: asset.asset.contentType,
        downloadUrl: asset.publicUrl,
        publicUrl: asset.publicUrl,
      },
    };

    uploadedPinAssets.push({
      name: candidate.fileName,
      relativePath: `assets/${candidate.fileName}`,
      belongsToNodeId: candidate.nodeId,
      belongsToPinId: candidate.pinId,
      sizeBytes: sizeByKey.get(candidate.key) ?? asset.asset.size,
      assetId: asset.assetId,
      downloadUrl: asset.publicUrl,
      sha256,
    });
  }

  return uploadedPinAssets;
}

export function TemplateContainerBuilder({
  onBack,
  onSuccess,
}: TemplateContainerBuilderProps) {
  const createContainerMutation = useCreateTemplateContainer();
  const ingestManifestMutation = useIngestCloudDataManifest();
  const scanMutation = useTemplateDependencyScan();

  // Root workspace & local scanned pipelines (dùng chung key "local-default" với Local Workspace)
  const { rootPath, config } = useLocalWorkspaceConfig("local-default");
  const { masterPipelines: localMasters, componentPipes: localComponents } =
    useLocalPipelinesQuery(rootPath, config?.pipelinesDir);

  // Form State
  const [templateName, setTemplateName] = useState("");
  const [description] = useState("");
  const [category, setCategory] = useState("VFX / 3D Pipeline");
  const [dailyQuotaLimit, setDailyQuotaLimit] = useState("20");
  const [isPackaging, setIsPackaging] = useState(false);

  // Selected Master Pipelines & Components
  const [masterPipelines, setMasterPipelines] = useState<TemplateItemSelect[]>([]);
  const [components, setComponents] = useState<TemplateItemSelect[]>([]);

  // Scanned Manifest & 3-Column Bottom State (100% từ Rust Scanner)
  const [lastManifest, setLastManifest] = useState<TemplateDependencyManifest | null>(null);
  const [diagnostics, setDiagnostics] = useState<ManifestDiagnostic[]>([]);
  const [constants, setConstants] = useState<ConstantConfigItem[]>([]);
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);

  // Dialog State for adding items
  const [pickerModal, setPickerModal] = useState<"master" | "component" | null>(null);

  const availableMasters = useMemo(() => {
    const list = localMasters || [];
    const selectedPaths = new Set(masterPipelines.map((m) => m.relativePath));
    return list.filter((p: ScannedPipelineYamlItemRust) => !selectedPaths.has(p.relativePath));
  }, [localMasters, masterPipelines]);

  const availableComponents = useMemo(() => {
    const list = localComponents || [];
    const selectedPaths = new Set(components.map((c) => c.relativePath));
    return list.filter((c: ScannedPipelineYamlItemRust) => !selectedPaths.has(c.relativePath));
  }, [localComponents, components]);

  const runDependencyScan = async (rootPipelinePaths: string[]) => {
    if (!rootPath || rootPipelinePaths.length === 0) {
      setLastManifest(null);
      setDiagnostics([]);
      setComponents([]);
      setConstants([]);
      setScripts([]);
      setAssets([]);
      return;
    }

    try {
      const manifest = await scanMutation.mutateAsync({
        rootPath,
        rootPipelinePaths,
        persist: true,
      });

      setLastManifest(manifest);
      setDiagnostics(manifest.diagnostics || []);

      // Đồng bộ Master & Component từ manifest
      setMasterPipelines(
        manifest.pipelines
          .filter((p) => p.kind === "master")
          .map((p) => ({
            id: p.slug,
            slug: p.slug,
            name: p.slug,
            relativePath: p.relativePath,
            graphHash: p.graphHash,
          }))
      );

      setComponents(
        manifest.pipelines
          .filter((p) => p.kind === "component")
          .map((p) => ({
            id: p.slug,
            slug: p.slug,
            name: p.slug,
            relativePath: p.relativePath,
            graphHash: p.graphHash,
          }))
      );

      setConstants(
        manifest.constants.map((c) => {
          let cleanValue = c.valueJson;
          if (typeof cleanValue === "string") {
            try {
              const parsed = JSON.parse(cleanValue);
              cleanValue = parsed;
            } catch {
              // Raw string
            }
          }
          return {
            key: c.key,
            label: c.key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
            dataType: c.dataType || "String",
            scope: c.scope || "General",
            isRequired: true,
            defaultValue: typeof cleanValue === "string" ? cleanValue : JSON.stringify(cleanValue),
          };
        })
      );

      setScripts(
        manifest.scripts.map((s) => ({
          id: s.key,
          name: s.key.split("/").pop() || s.key,
          path: s.key,
          executor: s.executor,
          contentHash: s.contentHash,
        }))
      );

      setAssets(
        manifest.assets.map((a) => ({
          name: a.name,
          relativePath: a.relativePath,
          sizeBytes: a.sizeBytes,
          hash: a.hash,
        }))
      );

      if (manifest.totals.errorCount > 0) {
        toast.warning(`Scan completed with ${manifest.totals.errorCount} error(s).`);
      } else {
        toast.success(
          `Scanned ${manifest.totals.masterCount} master, ${manifest.totals.componentCount} components, ${manifest.totals.scriptCount} scripts.`
        );
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to scan template dependencies");
    }
  };

  const handleAddMaster = async (item: ScannedPipelineYamlItemRust) => {
    const nextPaths = Array.from(
      new Set([...masterPipelines.map((m) => m.relativePath), item.relativePath])
    );
    await runDependencyScan(nextPaths);
  };

  const handleRemoveMaster = async (relativePath: string) => {
    const nextPaths = masterPipelines
      .filter((m) => m.relativePath !== relativePath)
      .map((m) => m.relativePath);
    await runDependencyScan(nextPaths);
  };

  const handleAddComponent = (item: ScannedPipelineYamlItemRust) => {
    const displayName = item.fileName.replace(/\.(pipeline|component)\.ya?ml$/i, "");
    setComponents((prev) => [
      ...prev,
      { id: item.relativePath, slug: displayName, name: displayName, relativePath: item.relativePath },
    ]);
  };

  const handleRemoveComponent = (slug: string) => {
    setComponents((prev) => prev.filter((c) => c.slug !== slug));
  };

  const handleToggleRequired = (index: number) => {
    setConstants((prev) =>
      prev.map((c, i) => (i === index ? { ...c, isRequired: !c.isRequired } : c))
    );
  };

  const handleToggleClearValue = (index: number) => {
    setConstants((prev) =>
      prev.map((c, i) =>
        i === index
          ? {
              ...c,
              defaultValue: c.defaultValue ? "" : c.defaultValue,
              isRequired: true,
            }
          : c
      )
    );
  };

  const handleRemoveConstant = (index: number) => {
    setConstants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveScript = (id: string) => {
    setScripts((prev) => prev.filter((s) => s.id !== id));
  };

  const handleRemoveAsset = (index: number) => {
    setAssets((prev) => prev.filter((_, i) => i !== index));
  };

  const isBusy =
    scanMutation.isPending ||
    ingestManifestMutation.isPending ||
    createContainerMutation.isPending ||
    isPackaging;

  // Packaging: Phase 1 (Ingest Cloud Data Pool) -> Phase 2 (Create Template Container)
  const handlePackageTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Please enter a Template Name.");
      return;
    }

    if (!lastManifest || masterPipelines.length === 0) {
      toast.error("Please select at least one Master Pipeline and scan dependencies first.");
      return;
    }

    setIsPackaging(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      // Lấy snapshot graph thật cho từng pipeline từ SQLite local
      const graphs = await Promise.all(
        lastManifest.pipelines.map(async (p) => {
          const snapshotStr = await invoke<string | null>("load_local_pipeline_snapshot", {
            rootPath: lastManifest.rootPath,
            pipelineSlug: p.slug,
          });
          if (!snapshotStr) {
            throw new Error(`Pipeline snapshot "${p.slug}" is missing from Local Workspace.`);
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(snapshotStr);
          } catch {
            throw new Error(`Pipeline snapshot "${p.slug}" contains invalid JSON.`);
          }
          if (!isRecord(parsed)) {
            throw new Error(`Pipeline snapshot "${p.slug}" does not match the workspace contract.`);
          }

          return {
            slug: p.slug,
            graphHash: p.graphHash,
            dagBundleJson: parsed,
            contractsJson: isRecord(parsed.contracts) ? parsed.contracts : {},
          };
        })
      ) satisfies TemplateGraphSnapshot[];

      const templateSlug = slugifyTemplateName(templateName);

      const normalizeScriptKey = (raw: string) =>
        raw.replace(/^local:(script:)?/, "").trim();

      const scriptHashByKey = new Map<string, string>();
      for (const s of lastManifest.scripts) {
        if (s.contentHash) {
          scriptHashByKey.set(s.key, s.contentHash);
          const bare = normalizeScriptKey(s.key);
          scriptHashByKey.set(bare, s.contentHash);
          scriptHashByKey.set(`local:${bare}`, s.contentHash);
          scriptHashByKey.set(`local:script:${bare}`, s.contentHash);
        }
      }

      const localNodeContracts = await loadLocalNodeContracts(lastManifest.rootPath);
      const usedNodeRefs = new Set(
        graphs.flatMap((graph) =>
          getGraphNodes(graph.dagBundleJson)
            .map((node) => node.refId)
            .filter((refId): refId is string => typeof refId === "string")
        )
      );
      const paletteNodesJson = localNodeContracts
        .filter((item) => {
          if (!usedNodeRefs.has(item.refId)) return false;
          const kind = item.sourceRef?.kind ?? (item.source === "System" ? "builtin" : undefined);
          return kind !== "builtin";
        })
        .map((item) => {
          const currentSourceRef = item.sourceRef;
          const bareRefId = normalizeScriptKey(item.refId);
          const scriptKey =
            item.scriptKey ??
            ("scriptKey" in (currentSourceRef ?? {}) ? (currentSourceRef as any).scriptKey : undefined) ??
            bareRefId;
          const currentHash =
            "contentHash" in (currentSourceRef ?? {}) ? (currentSourceRef as any).contentHash : undefined;
          const contentHash =
            scriptHashByKey.get(item.refId) ??
            scriptHashByKey.get(bareRefId) ??
            (scriptKey ? scriptHashByKey.get(scriptKey) : undefined) ??
            currentHash ??
            "";
          const nextSourceRef: PaletteNodeSourceRef =
            currentSourceRef?.kind === "template"
              ? {
                  ...currentSourceRef,
                  contentHash: contentHash || currentSourceRef.contentHash,
                  ref: currentSourceRef.ref ?? item.refId,
                  ownerSlug: currentSourceRef.ownerSlug ?? templateSlug,
                }
              : {
                  kind: "template",
                  ref: item.refId,
                  ownerSlug: templateSlug,
                  slug: templateSlug,
                  refId: item.refId,
                  scriptKey: scriptKey ?? undefined,
                  contentHash: contentHash,
                  originTemplate: {
                    slug: templateSlug,
                  },
                };
          const isPureOrConstant =
            item.viewVariant === "Constant" ||
            item.capabilities?.viewVariant === "Constant" ||
            item.capabilities?.isConstantNode === true ||
            (item.executor || "").toLowerCase() === "pure";
          const execInputs = Array.isArray(item.execInputs)
            ? item.execInputs
            : isPureOrConstant
            ? []
            : [{ id: "exec_in", label: "Exec" }];
          const execOutputs = Array.isArray(item.execOutputs)
            ? item.execOutputs
            : isPureOrConstant
            ? []
            : [{ id: "exec_out", label: "Exec" }];

          return {
            ...item,
            execInputs,
            execOutputs,
            sourceRef: nextSourceRef,
          };
        });

      const uploadedPinAssets = await uploadLocalFilePins(
        graphs,
        lastManifest.rootPath,
        paletteNodesJson
      );

      if (uploadedPinAssets.length > 0) {
        toast.info(
          `Uploaded and remapped ${uploadedPinAssets.length} file asset pin(s) to Cloud storage.`
        );
        for (const graph of graphs) {
          const encoded = new TextEncoder().encode(JSON.stringify(graph.dagBundleJson));
          graph.graphHash = await sha256Hex(encoded);
        }
      }
      const graphHashBySlug = new Map(graphs.map((g) => [g.slug, g.graphHash]));

      // 1. Ingest canonical pipelines & scripts into Unified Cloud Data Pool
      const ingestRes = await ingestManifestMutation.mutateAsync({
        data: {
          manifest: {
            rootPath: lastManifest.rootPath,
            pipelines: lastManifest.pipelines.map((p) => ({
              slug: p.slug,
              kind: p.kind,
              relativePath: p.relativePath,
              graphSource: p.graphSource,
              graphHash: graphHashBySlug.get(p.slug) ?? p.graphHash,
              dependsOn: p.dependsOn,
              scriptKeys: p.scriptKeys,
            })),
            scripts: lastManifest.scripts.map((s) => ({
              key: s.key,
              executor: s.executor,
              contentHash: s.contentHash,
              sourceCode: s.sourceCode,
              requirements: s.requirements,
              usedBy: s.usedBy,
            })),
          },
          graphs,
        },
      });

      const versionIdsBySlug = ingestRes.versionIdsBySlug || {};
      const scriptIdsByKey = ingestRes.scriptIdsByKey || {};

      const masterVersionIds = masterPipelines
        .map((m) => versionIdsBySlug[m.slug])
        .filter((id): id is string => Boolean(id));

      const componentVersionIds = components
        .map((c) => versionIdsBySlug[c.slug])
        .filter((id): id is string => Boolean(id));

      const scriptArtifactIds = scripts
        .map((s) => scriptIdsByKey[s.path])
        .filter((id): id is string => Boolean(id));

      // 2. Create Template Container referencing ingested PipelineVersions
      await createContainerMutation.mutateAsync({
        data: {
          templateId: null,
          title: templateName.trim(),
          slug: templateSlug,
          description: description.trim() || null,
          category: category.trim() || null,
          defaultQuotaLimit: dailyQuotaLimit ? Number(dailyQuotaLimit) : 20,
          masterVersionIds,
          componentVersionIds,
          scriptArtifactIds,
          constants: constants.map((c) => ({
            key: c.key,
            label: c.label,
            dataType: c.dataType,
            scope: c.scope,
            isRequired: c.isRequired,
            description: c.description || null,
            defaultValue: c.defaultValue || null,
          })),
          assets: [
            ...assets.map((a) => ({
              name: a.name,
              relativePath: a.relativePath || null,
              belongsToNodeId: null,
              belongsToPinId: null,
              sizeBytes: a.sizeBytes ?? null,
            })),
            ...uploadedPinAssets.map((a) => ({
              name: a.name,
              relativePath: a.relativePath,
              belongsToNodeId: a.belongsToNodeId,
              belongsToPinId: a.belongsToPinId,
              sizeBytes: a.sizeBytes,
              assetId: a.assetId,
              downloadUrl: a.downloadUrl,
              sha256: a.sha256,
            })),
          ],
          paletteNodesJson,
        } as any,
      });

      toast.success(`Template Container "${templateName}" packaged & published!`);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || "Failed to package template container");
    } finally {
      setIsPackaging(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar with Back and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onPress={onBack}
            className="h-8 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Templates</span>
          </Button>
          <div className="h-4 w-px bg-border/60" />
          <div className="flex items-center gap-2">
            <PackagePlus className="size-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              Make Template Container
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {masterPipelines.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onPress={() => runDependencyScan(masterPipelines.map((m) => m.relativePath))}
              isDisabled={isBusy}
              className="h-8 gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={`size-3.5 ${scanMutation.isPending ? "animate-spin" : ""}`} />
              <span>Re-scan</span>
            </Button>
          )}
          <Button
            size="sm"
            onPress={handlePackageTemplate}
            isDisabled={isBusy || masterPipelines.length === 0}
            className="h-8 gap-2 text-xs font-medium cursor-pointer"
          >
            <Save className="size-3.5" />
            <span>
              {ingestManifestMutation.isPending
                ? "Ingesting Data..."
                : createContainerMutation.isPending
                  ? "Packaging..."
                  : "Package & Publish Container"}
            </span>
          </Button>
        </div>
      </div>

      {/* Diagnostics Banner */}
      {diagnostics.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1.5">
          {diagnostics.map((d, idx) => (
            <div key={idx} className="flex items-center gap-2 text-xs">
              {d.level === "error" ? (
                <AlertCircle className="size-4 text-destructive shrink-0" />
              ) : (
                <AlertTriangle className="size-4 text-amber-500 shrink-0" />
              )}
              <Badge variant="outline" className="text-[10px] font-mono">
                {d.code}
              </Badge>
              <span className="text-foreground">{d.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Main Scaffold Container */}
      <div className="rounded-xl border border-border/80 bg-card/60 p-6 shadow-sm space-y-6">
        {/* 1. Template Name Section */}
        <div className="space-y-2">
          <Label className="text-xs font-mono font-semibold tracking-wide text-foreground uppercase">
            Template Name
          </Label>
          <Input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Daz to Unreal Modular Character Pipeline..."
            className="h-10 text-sm font-medium bg-background border-border/80 focus-visible:ring-primary/40"
          />
        </div>

        {/* Optional Metadata Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. VFX / 3D Pipeline"
              className="h-8 text-xs bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Quota Limit</Label>
            <Input
              type="number"
              value={dailyQuotaLimit}
              onChange={(e) => setDailyQuotaLimit(e.target.value)}
              placeholder="20"
              className="h-8 text-xs bg-background"
            />
          </div>
        </div>

        {/* 2. Master Pipelines Section */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-mono font-semibold tracking-wide text-foreground uppercase">
                Master Pipelines
              </Label>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
                {masterPipelines.length}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onPress={() => setPickerModal("master")}
              isDisabled={isBusy}
              className="h-7 text-xs gap-1.5 border-dashed cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Add Master Pipeline</span>
            </Button>
          </div>

          <div className="min-h-24 rounded-lg border border-border/70 bg-background/50 p-3 flex flex-wrap gap-3 items-center">
            {masterPipelines.length === 0 ? (
              <div className="w-full text-center py-4 text-xs text-muted-foreground">
                No master pipeline added yet. Click <strong>+ Add Master Pipeline</strong> to scan dependencies.
              </div>
            ) : (
              masterPipelines.map((m) => (
                <div
                  key={m.relativePath}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border bg-card shadow-xs"
                >
                  <Workflow className="size-4 text-primary" />
                  <div className="text-left">
                    <div className="text-xs font-semibold leading-tight">{m.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {m.graphHash ? `#${m.graphHash.slice(0, 8)}` : m.relativePath}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveMaster(m.relativePath)}
                    className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 3. Components Section */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-mono font-semibold tracking-wide text-foreground uppercase">
                Components
              </Label>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-mono">
                {components.length}
              </Badge>
            </div>
            <Button
              variant="outline"
              size="sm"
              onPress={() => setPickerModal("component")}
              isDisabled={isBusy}
              className="h-7 text-xs gap-1.5 border-dashed cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Add Component</span>
            </Button>
          </div>

          <div className="min-h-24 rounded-lg border border-border/70 bg-background/50 p-3 flex flex-wrap gap-3 items-center">
            {components.length === 0 ? (
              <div className="w-full text-center py-4 text-xs text-muted-foreground">
                Components are auto-discovered when you select a Master Pipeline.
              </div>
            ) : (
              components.map((c) => (
                <div
                  key={c.slug}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border bg-card shadow-xs"
                >
                  <Layers className="size-4 text-amber-500" />
                  <div className="text-left">
                    <div className="text-xs font-semibold leading-tight">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {c.graphHash ? `#${c.graphHash.slice(0, 8)}` : c.relativePath}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveComponent(c.slug)}
                    className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 4. Bottom 3-Column Grid: constant configure | scripts | assets */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          {/* Column A: Constant Configure */}
          <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="size-3.5 text-amber-500" />
                  <span className="text-xs font-mono font-semibold uppercase text-foreground">
                    Constant Configure ({constants.length})
                  </span>
                </div>
              </div>

              {constants.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No constants detected yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {constants.map((c, idx) => (
                    <div
                      key={c.key}
                      className="rounded-md border border-border/60 bg-card p-2.5 text-xs space-y-1.5 shadow-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          {c.label}
                          {c.isRequired && <span className="text-amber-500 font-bold">*</span>}
                        </span>
                        <button
                          onClick={() => handleRemoveConstant(idx)}
                          className="text-muted-foreground hover:text-destructive p-0.5"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">
                        {c.key} ({c.scope})
                      </div>
                      {c.defaultValue ? (
                        <div className="text-[10px] font-mono text-emerald-500/90 bg-emerald-500/10 px-1.5 py-0.5 rounded truncate">
                          Keep: {c.defaultValue}
                        </div>
                      ) : (
                        <div className="text-[10px] font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                          Cleared — User must input
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1 gap-1">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleRequired(idx)}
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              c.isRequired
                                ? "bg-amber-500/10 text-amber-500 font-semibold"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {c.isRequired ? "Priority *" : "Optional"}
                          </button>
                          {c.defaultValue && (
                            <button
                              type="button"
                              onClick={() => handleToggleClearValue(idx)}
                              title="Clear value so user must input this constant"
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                            >
                              Clear value
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground uppercase font-mono">
                          {c.dataType}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
              * Required constants must be provided by user upon cloud execution.
            </p>
          </div>

          {/* Column B: Scripts */}
          <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <FileCode className="size-3.5 text-sky-500" />
                  <span className="text-xs font-mono font-semibold uppercase text-foreground">
                    Scripts ({scripts.length})
                  </span>
                </div>
              </div>

              {scripts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No scripts detected yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {scripts.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-card p-2 text-xs shadow-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileCode className="size-3.5 text-muted-foreground shrink-0" />
                        <div className="truncate">
                          <div className="font-medium truncate">{s.name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground truncate">
                            {s.path} · {s.executor}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveScript(s.id)}
                        className="text-muted-foreground hover:text-destructive p-0.5 shrink-0 ml-1"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
              Content-addressed scripts ingested into Cloud Data Pool.
            </p>
          </div>

          {/* Column C: Assets */}
          <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <FolderArchive className="size-3.5 text-emerald-500" />
                  <span className="text-xs font-mono font-semibold uppercase text-foreground">
                    Assets ({assets.length})
                  </span>
                </div>
              </div>

              {assets.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">
                  No assets detected yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {assets.map((a, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-card p-2 text-xs shadow-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FolderArchive className="size-3.5 text-muted-foreground shrink-0" />
                        <div className="truncate">
                          <div className="font-medium truncate">{a.name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground truncate">
                            {a.relativePath} {a.sizeBytes ? `(${(a.sizeBytes / 1024).toFixed(1)} KB)` : ""}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveAsset(idx)}
                        className="text-muted-foreground hover:text-destructive p-0.5 shrink-0 ml-1"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
              Verified workspace assets with SHA-256 & byte size.
            </p>
          </div>
        </div>
      </div>

      {/* Item Picker Modal (Master or Component) */}
      <Dialog isOpen={Boolean(pickerModal)} onOpenChange={(open) => !open && setPickerModal(null)} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            {pickerModal === "master" ? (
              <>
                <Workflow className="size-4 text-primary" />
                <span>Select Master Pipeline</span>
              </>
            ) : (
              <>
                <Layers className="size-4 text-amber-500" />
                <span>Select Component Pipe</span>
              </>
            )}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Choose from pipelines scanned in your local workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-60 overflow-y-auto py-2">
          {pickerModal === "master" ? (
            availableMasters.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No more master pipelines available.
              </div>
            ) : (
              availableMasters.map((m: ScannedPipelineYamlItemRust) => (
                <div
                  key={m.relativePath}
                  onClick={() => {
                    setPickerModal(null);
                    handleAddMaster(m);
                  }}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors text-xs"
                >
                  <div>
                    <div className="font-semibold">{m.fileName}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{m.relativePath}</div>
                  </div>
                  <Plus className="size-4 text-muted-foreground" />
                </div>
              ))
            )
          ) : availableComponents.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No more component pipes available.
            </div>
          ) : (
            availableComponents.map((c: ScannedPipelineYamlItemRust) => (
              <div
                key={c.relativePath}
                onClick={() => {
                  handleAddComponent(c);
                  setPickerModal(null);
                }}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border hover:bg-accent/50 cursor-pointer transition-colors text-xs"
              >
                <div>
                  <div className="font-semibold">{c.fileName}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{c.relativePath}</div>
                </div>
                <Plus className="size-4 text-muted-foreground" />
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onPress={() => setPickerModal(null)} className="h-8 text-xs cursor-pointer">
            Cancel
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
