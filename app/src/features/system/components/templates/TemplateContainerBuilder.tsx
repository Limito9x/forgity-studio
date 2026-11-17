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
import { useLocalWorkspaceConfig, useLocalPipelinesQuery } from "@/features/pipelines/hooks/workspace";
import type { ScannedPipelineYamlItemRust } from "@/features/pipelines/types/workspaceConfig";

interface TemplateItemSelect {
  id: string;
  slug: string;
  name: string;
  filePath?: string;
  engine?: string;
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
}

interface AssetItem {
  name: string;
  relativePath?: string;
  sizeBytes?: number;
}

interface TemplateContainerBuilderProps {
  onBack: () => void;
  onSuccess: () => void;
}

export function TemplateContainerBuilder({
  onBack,
  onSuccess,
}: TemplateContainerBuilderProps) {
  const createContainerMutation = useCreateTemplateContainer();

  // Root workspace & local scanned pipelines
  const { rootPath, config } = useLocalWorkspaceConfig("global");
  const { masterPipelines: localMasters, componentPipes: localComponents } =
    useLocalPipelinesQuery(rootPath, config?.pipelinesDir);

  // Form State
  const [templateName, setTemplateName] = useState("");
  const [description] = useState("");
  const [category, setCategory] = useState("VFX / 3D Pipeline");
  const [dailyQuotaLimit, setDailyQuotaLimit] = useState("20");

  // Selected Master Pipelines & Components
  const [masterPipelines, setMasterPipelines] = useState<TemplateItemSelect[]>([]);
  const [components, setComponents] = useState<TemplateItemSelect[]>([]);

  // 3-Column Bottom State (Rỗng mặc định, trích xuất từ pipeline thật hoặc thêm thủ công)
  const [constants, setConstants] = useState<ConstantConfigItem[]>([]);
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);

  // Dialog State for adding items
  const [pickerModal, setPickerModal] = useState<"master" | "component" | null>(null);

  // Available local pipelines parsed from disk
  const availableMasters = useMemo(() => {
    const list = localMasters || [];
    const selectedIds = new Set(masterPipelines.map((m) => m.slug));
    return list.filter((p: ScannedPipelineYamlItemRust) => !selectedIds.has(p.relativePath));
  }, [localMasters, masterPipelines]);

  const availableComponents = useMemo(() => {
    const list = localComponents || [];
    const selectedIds = new Set(components.map((c) => c.slug));
    return list.filter((c: ScannedPipelineYamlItemRust) => !selectedIds.has(c.relativePath));
  }, [localComponents, components]);

  const extractDependenciesFromYaml = (yamlContent?: string) => {
    if (!yamlContent) return;

    // Trích xuất script paths (ví dụ: script: blender/export.py hoặc .py)
    const scriptMatches = Array.from(
      yamlContent.matchAll(/([a-zA-Z0-9_\-/\\]+\.py)\b/g)
    ).map((m) => m[1].replace(/\\/g, "/"));

    if (scriptMatches.length > 0) {
      setScripts((prev) => {
        const existingPaths = new Set(prev.map((s) => s.path));
        const added: ScriptItem[] = [];
        for (const p of scriptMatches) {
          if (!existingPaths.has(p)) {
            existingPaths.add(p);
            added.push({
              id: p,
              name: p.split("/").pop() || p,
              path: p,
            });
          }
        }
        return added.length > 0 ? [...prev, ...added] : prev;
      });
    }

    // Trích xuất constant references (${constants.KEY} hoặc constants.KEY)
    const constMatches = Array.from(
      yamlContent.matchAll(/constants\.([a-zA-Z0-9_]+)/g)
    ).map((m) => m[1]);

    if (constMatches.length > 0) {
      setConstants((prev) => {
        const existingKeys = new Set(prev.map((c) => c.key));
        const added: ConstantConfigItem[] = [];
        for (const key of constMatches) {
          if (!existingKeys.has(key)) {
            existingKeys.add(key);
            added.push({
              key,
              label: key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
              dataType: "string",
              scope: "project",
              isRequired: true,
              defaultValue: "",
            });
          }
        }
        return added.length > 0 ? [...prev, ...added] : prev;
      });
    }
  };

  const handleAddMaster = (item: ScannedPipelineYamlItemRust) => {
    const displayName = item.fileName.replace(/\.(pipeline|component)\.ya?ml$/i, "");
    setMasterPipelines((prev) => [
      ...prev,
      { id: item.relativePath, slug: item.relativePath, name: displayName, filePath: item.fullPath },
    ]);
    extractDependenciesFromYaml(item.content);
  };

  const handleRemoveMaster = (slug: string) => {
    setMasterPipelines((prev) => prev.filter((m) => m.slug !== slug));
  };

  const handleAddComponent = (item: ScannedPipelineYamlItemRust) => {
    const displayName = item.fileName.replace(/\.(pipeline|component)\.ya?ml$/i, "");
    setComponents((prev) => [
      ...prev,
      { id: item.relativePath, slug: item.relativePath, name: displayName, filePath: item.fullPath },
    ]);
    extractDependenciesFromYaml(item.content);
  };

  const handleRemoveComponent = (slug: string) => {
    setComponents((prev) => prev.filter((c) => c.slug !== slug));
  };

  // Constant management
  const handleToggleRequired = (index: number) => {
    setConstants((prev) =>
      prev.map((c, i) => (i === index ? { ...c, isRequired: !c.isRequired } : c))
    );
  };

  const handleRemoveConstant = (index: number) => {
    setConstants((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddConstant = () => {
    const key = `custom_constant_${constants.length + 1}`;
    setConstants((prev) => [
      ...prev,
      {
        key,
        label: `Custom Constant ${prev.length + 1}`,
        dataType: "string",
        scope: "job",
        isRequired: true,
        defaultValue: "",
      },
    ]);
  };

  // Script management
  const handleRemoveScript = (id: string) => {
    setScripts((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAddScript = () => {
    const name = prompt("Enter script relative path (e.g. unreal/custom_task.py):");
    if (!name?.trim()) return;
    setScripts((prev) => [
      ...prev,
      { id: String(Date.now()), name: name.trim().split("/").pop() || name.trim(), path: name.trim() },
    ]);
  };

  // Asset management
  const handleRemoveAsset = (index: number) => {
    setAssets((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddAsset = () => {
    const name = prompt("Enter asset filename (e.g. starter_template.zip):");
    if (!name?.trim()) return;
    setAssets((prev) => [
      ...prev,
      { name: name.trim(), relativePath: `Content/${name.trim()}`, sizeBytes: 1024 * 1024 },
    ]);
  };

  // Packaging and submit
  const handlePackageTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Please enter a Template Name.");
      return;
    }

    try {
      await createContainerMutation.mutateAsync({
        data: {
          templateId: null,
          title: templateName.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
          defaultQuotaLimit: dailyQuotaLimit ? Number(dailyQuotaLimit) : 20,
          masterVersionIds: [],
          componentVersionIds: [],
          scriptArtifactIds: [],
          constants: constants.map((c) => ({
            key: c.key,
            label: c.label,
            dataType: c.dataType,
            scope: c.scope,
            isRequired: c.isRequired,
            description: c.description || null,
          })),
          assets: assets.map((a) => ({
            name: a.name,
            relativePath: a.relativePath || null,
            belongsToNodeId: null,
            belongsToPinId: null,
            sizeBytes: a.sizeBytes || null,
          })),
          paletteNodesJson: null as any,
        },
      });

      toast.success(`Template Container "${templateName}" packaged successfully!`);
      onSuccess();
    } catch (err: any) {
      toast.error(err?.message || "Failed to package template container");
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
          <Button
            size="sm"
            onPress={handlePackageTemplate}
            isDisabled={createContainerMutation.isPending}
            className="h-8 gap-2 text-xs font-medium cursor-pointer"
          >
            <Save className="size-3.5" />
            <span>{createContainerMutation.isPending ? "Packaging..." : "Package & Publish Container"}</span>
          </Button>
        </div>
      </div>

      {/* Main Scaffold Container matching Excalidraw Sketch */}
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
            <Label className="text-xs text-muted-foreground">Daily Quota Limit</Label>
            <Input
              type="number"
              value={dailyQuotaLimit}
              onChange={(e) => setDailyQuotaLimit(e.target.value)}
              placeholder="20"
              className="h-8 text-xs bg-background"
            />
          </div>
        </div>

        {/* 2. Master Pipelines Section (+ Cards) */}
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
              className="h-7 text-xs gap-1.5 border-dashed cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Add Master Pipeline</span>
            </Button>
          </div>

          <div className="min-h-24 rounded-lg border border-border/70 bg-background/50 p-3 flex flex-wrap gap-3 items-center">
            {masterPipelines.length === 0 ? (
              <div className="w-full text-center py-4 text-xs text-muted-foreground">
                No master pipeline added yet. Click <strong>+ Add Master Pipeline</strong> to select.
              </div>
            ) : (
              masterPipelines.map((m) => (
                <div
                  key={m.slug}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border bg-card shadow-xs group"
                >
                  <Workflow className="size-4 text-primary" />
                  <div className="text-left">
                    <div className="text-xs font-semibold leading-tight">{m.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{m.slug}</div>
                  </div>
                  <button
                    onClick={() => handleRemoveMaster(m.slug)}
                    className="text-muted-foreground hover:text-destructive p-0.5 rounded transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 3. Components Section (+ Cards) */}
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
              className="h-7 text-xs gap-1.5 border-dashed cursor-pointer"
            >
              <Plus className="size-3.5" />
              <span>Add Component</span>
            </Button>
          </div>

          <div className="min-h-24 rounded-lg border border-border/70 bg-background/50 p-3 flex flex-wrap gap-3 items-center">
            {components.length === 0 ? (
              <div className="w-full text-center py-4 text-xs text-muted-foreground">
                No component pipes attached. Click <strong>+ Add Component</strong> to include child pipes.
              </div>
            ) : (
              components.map((c) => (
                <div
                  key={c.slug}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border bg-card shadow-xs group"
                >
                  <Layers className="size-4 text-amber-500" />
                  <div className="text-left">
                    <div className="text-xs font-semibold leading-tight">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{c.slug}</div>
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
                    Constant Configure
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onPress={handleAddConstant}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>

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
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => handleToggleRequired(idx)}
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          c.isRequired
                            ? "bg-amber-500/10 text-amber-500 font-semibold"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {c.isRequired ? "Required *" : "Optional"}
                      </button>
                      <span className="text-[10px] text-muted-foreground uppercase font-mono">
                        {c.dataType}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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
                    Scripts
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onPress={handleAddScript}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>

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
                        <div className="text-[10px] font-mono text-muted-foreground truncate">{s.path}</div>
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
            </div>

            <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
              Python and DCC scripts packaged into immutable container artifact.
            </p>
          </div>

          {/* Column C: Assets */}
          <div className="rounded-lg border border-border/80 bg-background/50 p-4 space-y-3 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-border/50 pb-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <FolderArchive className="size-3.5 text-emerald-500" />
                  <span className="text-xs font-mono font-semibold uppercase text-foreground">
                    Assets
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onPress={handleAddAsset}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>

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
                        <div className="text-[10px] font-mono text-muted-foreground truncate">{a.relativePath}</div>
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
            </div>

            <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40">
              Starter packages and Unreal/Blender binary assets bundled.
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
            Choose from pipelines scanned in your local workspace or draft registry.
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
                    handleAddMaster(m);
                    setPickerModal(null);
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
