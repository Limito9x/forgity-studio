import { useState } from "react";
import { BaseDialog } from "@/components/custom-ui/overlays/dialog/BaseDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { AXIOS_INSTANCE } from "@/lib/api-client";
import { saveFileWithStrategy } from "@/lib/platform/saveFileStrategy";
import {
  Download,
  Upload,
  Workflow,
  Settings,
  FolderGit2,
  FileCheck2,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  useImportProjectPackage,
} from "../hooks/useProjectMigrations";
import { toast } from "sonner";
import type { ImportProjectPackageResultDto } from "@/gen/model";
import { featureFlags } from "@/config/featureFlags";

interface UnifiedMigrationWizardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  initialMode?: "export" | "import";
}

interface DomainOption {
  key: string;
  label: string;
  description: string;
  icon: typeof Workflow;
}

const AVAILABLE_DOMAINS: DomainOption[] = [
  {
    key: "pipelines",
    label: "Pipelines & Python Scripts",
    description: "All pipeline graphs, tools, parameters, and python files extracted to /scripts",
    icon: Workflow,
  },
  {
    key: "content",
    label: "Content Types & Schemas",
    description: "Content schema definitions, display configs, and dynamic form fields",
    icon: Settings,
  },
  {
    key: "repositories",
    label: "Repository Blueprints",
    description: "Repository filter patterns, tags, and extensions (machine paths omitted)",
    icon: FolderGit2,
  },
];

export function UnifiedMigrationWizardDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  initialMode = "export",
}: UnifiedMigrationWizardDialogProps) {
  const [activeTab, setActiveTab] = useState<"export" | "import">(initialMode);

  const activeDomains = AVAILABLE_DOMAINS.filter((d) => {
    if (!featureFlags.enableStudioCatalog && (d.key === "content" || d.key === "repositories")) {
      return false;
    }
    return true;
  });

  // Export State
  const [selectedDomains, setSelectedDomains] = useState<string[]>(() =>
    activeDomains.map((d) => d.key)
  );

  // Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<0 | 1>(0); // 0 = Overwrite, 1 = Skip
  const [importResult, setImportResult] = useState<ImportProjectPackageResultDto | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const importMutation = useImportProjectPackage();

  const toggleDomain = (domainKey: string) => {
    setSelectedDomains((prev) =>
      prev.includes(domainKey)
        ? prev.filter((k) => k !== domainKey)
        : [...prev, domainKey]
    );
  };

  const handleExport = async () => {
    if (selectedDomains.length === 0) {
      toast.error("Please select at least one domain to export.");
      return;
    }

    try {
      setIsExporting(true);
      toast.info("Generating project package...", { duration: 2000 });

      // Use AXIOS_INSTANCE to automatically include Authorization Bearer token & refresh interceptor
      const response = await AXIOS_INSTANCE.post(
        `/api/projects/${projectId}/migrations/export`,
        {
          id: projectId,
          domains: selectedDomains,
        },
        {
          responseType: "blob",
        }
      );

      const blob = new Blob([response.data], { type: "application/zip" });
      const contentDisposition = response.headers["content-disposition"] as string | undefined;
      let fileName = `${projectName.toLowerCase().replace(/\s+/g, "-")}-package.forgity.pkg`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^";]+)"?/);
        if (match && match[1]) fileName = match[1];
      }

      const saved = await saveFileWithStrategy({
        fileName,
        blob,
        extensions: ["forgity.pkg", "zip", "pkg"],
        filterName: "Forgity Transfer Package",
      });

      if (saved) {
        toast.success("Package downloaded successfully!");
        onOpenChange(false);
      } else {
        toast.info("Export cancelled.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to export package.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error("Please choose a .forgity.pkg or .zip file.");
      return;
    }

    try {
      const res = await importMutation.mutateAsync({
        id: projectId,
        data: {
          file: importFile,
          strategy: strategy as any,
        },
      });

      setImportResult(res);
      toast.success("Project package imported!");
    } catch (err: any) {
      toast.error(err.message || "Failed to import package.");
    }
  };

  return (
    <BaseDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Project Migration & Package Hub"
      description={`Export or import pipelines, content schemas, and repository blueprints for ${projectName}.`}
      size="2xl"
    >
      <div className="flex flex-col gap-6 py-2">
        {/* Segmented Pill Tabs */}
        <div className="flex items-center bg-muted/60 p-1 rounded-xl border border-border/60 gap-1 w-full max-w-sm">
          <Button
            variant={activeTab === "export" ? "secondary" : "ghost"}
            size="sm"
            onPress={() => {
              setActiveTab("export");
              setImportResult(null);
            }}
            className={cn(
              "flex-1 h-8 flex items-center justify-center gap-2 text-xs font-medium rounded-lg transition-all cursor-pointer",
              activeTab === "export"
                ? "bg-background text-foreground font-semibold shadow-xs border border-border/50"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Download className="size-3.5" />
            <span>Export Package</span>
          </Button>
          <Button
            variant={activeTab === "import" ? "secondary" : "ghost"}
            size="sm"
            onPress={() => {
              setActiveTab("import");
              setImportResult(null);
            }}
            className={cn(
              "flex-1 h-8 flex items-center justify-center gap-2 text-xs font-medium rounded-lg transition-all cursor-pointer",
              activeTab === "import"
                ? "bg-background text-foreground font-semibold shadow-xs border border-border/50"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Upload className="size-3.5" />
            <span>Import Package</span>
          </Button>
        </div>

        {/* Tab 1: Export Package */}
        {activeTab === "export" && (
          <div className="flex flex-col gap-5">
            <div className="text-sm text-muted-foreground">
              Select which resource domains to bundle into the transfer package (<code>.forgity.pkg</code>).
              Python scripts are extracted into raw <code>scripts/*.py</code> files inside the ZIP for easy inspection.
            </div>

            <div className="flex flex-col gap-3">
              {activeDomains.map((domain) => {
                const Icon = domain.icon;
                const isChecked = selectedDomains.includes(domain.key);
                return (
                  <div
                    key={domain.key}
                    onClick={() => toggleDomain(domain.key)}
                    className={cn(
                      "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all",
                      isChecked
                        ? "bg-primary/5 border-primary/40 shadow-xs"
                        : "bg-card hover:bg-muted/30 border-border/60"
                    )}
                  >
                    <Checkbox
                      isSelected={isChecked}
                      onChange={() => toggleDomain(domain.key)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                        <Icon className="size-4 text-primary" />
                        <span>{domain.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {domain.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onPress={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onPress={handleExport}
                isDisabled={isExporting || selectedDomains.length === 0}
                className="gap-2"
              >
                {isExporting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                <span>Export ({selectedDomains.length} domains)</span>
              </Button>
            </div>
          </div>
        )}

        {/* Tab 2: Import Package */}
        {activeTab === "import" && (
          <div className="flex flex-col gap-5">
            {importResult ? (
              <div className="flex flex-col gap-4 p-4 rounded-xl border border-border/80 bg-muted/20">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-5" />
                  <span>Import Completed with status: {importResult.status}</span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-lg bg-background border border-border/40">
                    <div className="font-semibold text-base">{importResult.totalItems}</div>
                    <div className="text-muted-foreground">Total</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background border border-border/40">
                    <div className="font-semibold text-base text-emerald-600">{importResult.createdItems}</div>
                    <div className="text-muted-foreground">Created</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background border border-border/40">
                    <div className="font-semibold text-base text-blue-600">{importResult.updatedItems}</div>
                    <div className="text-muted-foreground">Updated</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-background border border-border/40">
                    <div className="font-semibold text-base text-amber-600">{importResult.skippedItems}</div>
                    <div className="text-muted-foreground">Skipped</div>
                  </div>
                </div>

                {importResult.warnings && importResult.warnings.length > 0 && (
                  <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
                    <div className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="size-4" />
                      <span>Warnings ({importResult.warnings.length}):</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-0.5">
                      {importResult.warnings.map((w, idx) => (
                        <li key={idx}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="default" size="sm" onPress={() => onOpenChange(false)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">
                  Select a transfer package file (<code>.forgity.pkg</code> or <code>.zip</code>).
                  The package will be checked, uncompressed and applied safely to your project.
                </div>

                {/* File Drop / Select Area */}
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-semibold">Package File</Label>
                  <label className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-border/70 hover:border-primary/60 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-all">
                    <FileCheck2 className="size-8 text-muted-foreground mb-2" />
                    {importFile ? (
                      <div className="text-center">
                        <span className="font-medium text-sm text-foreground">{importFile.name}</span>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {(importFile.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    ) : (
                      <div className="text-center">
                        <span className="text-sm font-medium text-foreground">Click to browse file</span>
                        <p className="text-xs text-muted-foreground mt-1">Supports .forgity.pkg and .zip files</p>
                      </div>
                    )}
                    <Input
                      type="file"
                      accept=".forgity.pkg,.zip,.json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) setImportFile(file);
                      }}
                    />
                  </label>
                </div>

                {/* Conflict Strategy Option */}
                <div className="flex flex-col gap-2">
                  <Label className="text-xs font-semibold">Conflict Resolution Strategy</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div
                      onClick={() => setStrategy(0)}
                      className={cn(
                        "p-3 rounded-xl border cursor-pointer transition-all",
                        strategy === 0
                          ? "bg-primary/5 border-primary/40 shadow-xs"
                          : "bg-card hover:bg-muted/30 border-border/60"
                      )}
                    >
                      <div className="font-medium text-xs text-foreground">Overwrite Existing</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Replace existing nodes and schemas with new definitions
                      </div>
                    </div>
                    <div
                      onClick={() => setStrategy(1)}
                      className={cn(
                        "p-3 rounded-xl border cursor-pointer transition-all",
                        strategy === 1
                          ? "bg-primary/5 border-primary/40 shadow-xs"
                          : "bg-card hover:bg-muted/30 border-border/60"
                      )}
                    >
                      <div className="font-medium text-xs text-foreground">Skip Existing</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        Keep existing configurations untouched
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="outline" size="sm" onPress={() => onOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onPress={handleImport}
                    isDisabled={importMutation.isPending || !importFile}
                    className="gap-2"
                  >
                    {importMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Upload className="size-4" />
                    )}
                    <span>Start Import</span>
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </BaseDialog>
  );
}

