import { useState, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  UploadCloud,
  FileJson,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Workflow,
  Boxes,
  Code2,
  RotateCcw,
  Layers,
  Sparkles,
  Check,
  Eye,
  Download,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { appConfig } from "@/config/appConfig";
import {
  useValidatePackageMutation,
  useImportPackageMutation,
  type PipelinePackageDto,
  type ValidatePipelinePackageResponseDto,
} from "../hooks/usePipelineExportImport";
import type { PipelinePackageScriptDto } from "@/gen/model";
import {
  generatePipelineSecurityAuditPrompt,
  downloadScriptFile,
} from "../utils/pipelineSecurityAudit";
import { InspectScriptCodeDialog } from "./InspectScriptCodeDialog";

interface ImportPipelineDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ImportPipelineDialog({
  projectId,
  isOpen,
  onClose,
  onSuccess,
}: ImportPipelineDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [packageData, setPackageData] = useState<PipelinePackageDto | null>(null);
  const [validationResult, setValidationResult] =
    useState<ValidatePipelinePackageResponseDto | null>(null);
  const [namePrefix, setNamePrefix] = useState<string>("");
  const [isTrusted, setIsTrusted] = useState(false);
  const [copiedAuditPrompt, setCopiedAuditPrompt] = useState(false);
  const [inspectingScript, setInspectingScript] = useState<PipelinePackageScriptDto | null>(null);

  const validateMutation = useValidatePackageMutation();
  const importMutation = useImportPackageMutation(projectId);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setPackageData(null);
    setValidationResult(null);
    setNamePrefix("");
    setIsTrusted(false);
    setCopiedAuditPrompt(false);
    setInspectingScript(null);
  }, []);

  const handleClose = () => {
    if (importMutation.isPending) return;
    resetState();
    onClose();
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      if (!file.name.toLowerCase().endsWith(".json")) {
        toast.error("Please select a valid .pipeline.json or .json bundle file.");
        return;
      }

      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as PipelinePackageDto;

        if (!parsed.pipelines || !Array.isArray(parsed.pipelines)) {
          toast.error("Invalid package structure: Missing 'pipelines' array.");
          return;
        }

        setSelectedFile(file);
        setPackageData(parsed);
        setIsTrusted(false);

        // Run Pre-flight validation on Backend
        const res = await validateMutation.mutateAsync({
          projectId,
          package: parsed,
        });
        setValidationResult(res);
      } catch (err) {
        toast.error("Failed to parse JSON file. Please ensure it is a valid Pipeline Package.");
      }
    },
    [projectId, validateMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/json": [".json"] },
    multiple: false,
    disabled: validateMutation.isPending || importMutation.isPending,
  });

  const hasNewCustomScripts = useMemo(() => {
    return validationResult?.scripts.some((s) => !s.alreadyExists) ?? false;
  }, [validationResult]);

  const handleCopyAllForAiAudit = () => {
    if (!packageData?.scripts || packageData.scripts.length === 0) {
      toast.error("No scripts found in this package to audit.");
      return;
    }

    const prompt = generatePipelineSecurityAuditPrompt(
      packageData.scripts,
      selectedFile?.name || "Pipeline Bundle"
    );

    navigator.clipboard.writeText(prompt);
    setCopiedAuditPrompt(true);
    toast.success(
      `Copied AI security audit prompt for ${packageData.scripts.length} script(s)! Paste into ChatGPT/Claude to audit.`,
      { duration: 4000 }
    );
    setTimeout(() => setCopiedAuditPrompt(false), 2500);
  };

  const handleDownloadScript = (script: PipelinePackageScriptDto) => {
    downloadScriptFile(script.fileName, script.scriptContent);
    toast.success(`Downloaded ${script.fileName}`);
  };

  const handleConfirmImport = async () => {
    if (!packageData) return;

    try {
      await importMutation.mutateAsync({
        projectId,
        package: packageData,
        namePrefix: namePrefix.trim() || undefined,
        createMissingContentTypes: true,
      });

      handleClose();
      onSuccess?.();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open && !importMutation.isPending) {
            handleClose();
          }
        }}
        className="sm:max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <UploadCloud className="size-5 text-primary" />
            <span>Import Pipeline Package</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Import standalone or multi-pipeline bundles into {appConfig.name} with automated dependency resolution.
          </p>
        </DialogHeader>

        {/* Step 1: Dropzone (When no file is selected yet) */}
        {!validationResult && (
          <div className="py-2">
            <div
              {...getRootProps()}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors duration-200",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40",
                validateMutation.isPending && "opacity-60 pointer-events-none"
              )}
            >
              <input {...getInputProps()} />
              {validateMutation.isPending ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm font-medium">Validating package schema and dependencies...</p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-muted rounded-full mb-3 text-muted-foreground">
                    <FileJson className="w-7 h-7" />
                  </div>
                  <h4 className="text-sm font-semibold mb-1">
                    Drag and drop your <span className="text-primary font-mono">.pipeline.json</span> file here
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-xs mb-3">
                    Supports standalone pipelines, nested sub-pipelines, or batch multi-pipeline bundles.
                  </p>
                  <Button size="sm" variant="secondary" type="button">
                    Browse File
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Pre-flight Review Screen */}
        {validationResult && (
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            {/* Package Summary Header */}
            <div className="bg-muted/40 p-3.5 rounded-lg border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileJson className="w-5 h-5 text-primary" />
                <div>
                  <div className="text-xs font-semibold">{selectedFile?.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Format {packageData?.formatVersion || "1.0"} • {validationResult.packageMetadata.totalPipelines} Pipeline(s)
                    {validationResult.packageMetadata.subPipelinesCount > 0 &&
                      ` (${validationResult.packageMetadata.subPipelinesCount} sub-pipeline)`}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onPress={resetState}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Change File
              </Button>
            </div>

            {/* Validation Errors Alert (if any) */}
            {!validationResult.isValid && validationResult.validationErrors.length > 0 && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex flex-col gap-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Package Validation Failed
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  {validationResult.validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Validation Warnings Alert (if any) */}
            {Boolean((validationResult as any).validationWarnings?.length) && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex flex-col gap-1">
                <div className="font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-4 h-4" /> Package Warnings
                </div>
                <ul className="list-disc list-inside space-y-0.5">
                  {((validationResult as any).validationWarnings as string[]).map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Name Prefix Option */}
            <div className="flex items-center gap-3 bg-card p-3 rounded-lg border">
              <div className="text-xs font-medium min-w-[120px]">
                Name Prefix:
              </div>
              <Input
                placeholder="e.g. [Imported] or Staging-"
                value={namePrefix}
                onChange={(e) => setNamePrefix(e.target.value)}
                className="h-8 text-xs max-w-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                Optional prefix added to imported pipeline names
              </span>
            </div>

            {/* Pipelines List */}
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Pipelines to Import ({validationResult.pipelines.length})
              </div>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto border rounded-lg p-2 bg-card">
                {validationResult.pipelines.map((p) => {
                  const displayName = namePrefix.trim()
                    ? `${namePrefix.trim()} ${p.name}`
                    : p.name;

                  return (
                    <div
                      key={p.bundleId}
                      className="p-2.5 rounded-md border bg-muted/20 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {p.isRoot ? (
                          <div className="p-1 rounded bg-primary/10 text-primary">
                            <Workflow className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className="p-1 rounded bg-amber-500/10 text-amber-500">
                            <Boxes className="w-3.5 h-3.5" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            <span>{displayName}</span>
                            {p.isRoot ? (
                              <Badge variant="outline" className="text-[10px] py-0 h-4">
                                Root
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] py-0 h-4 bg-amber-500/10 text-amber-600 border-amber-300">
                                Sub-pipeline
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {p.nodeCount} node(s) • {p.edgeCount} edge(s) • Import order #{p.importOrder}
                            {p.dependsOn.length > 0 && ` • Calls: ${p.dependsOn.join(", ")}`}
                          </div>
                        </div>
                      </div>

                      {p.hasNameConflict && (
                        <div className="flex items-center gap-1 text-[11px] text-amber-600">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Will be renamed if unchanged</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Scripts Dependencies & Trust Gate */}
            {validationResult.scripts.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5" /> Bundled Custom Scripts ({validationResult.scripts.length})
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                    onPress={handleCopyAllForAiAudit}
                  >
                    {copiedAuditPrompt ? (
                      <>
                        <Check className="size-3.5 text-emerald-500" />
                        Prompt Copied!
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-3.5 text-primary" />
                        Copy All for AI Audit
                      </>
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-2 border rounded-lg p-2 bg-card max-h-[140px] overflow-y-auto">
                  {validationResult.scripts.map((s) => {
                    const matchedPackageScript = packageData?.scripts?.find(
                      (ps) => ps.key === s.key || ps.fileName === s.fileName
                    );

                    return (
                      <div
                        key={s.key}
                        className="p-2 rounded border bg-muted/20 flex items-center justify-between text-xs group"
                      >
                        <div className="truncate mr-2">
                          <div className="font-mono font-medium text-[11px] truncate flex items-center gap-1">
                            <span>{s.fileName}</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground uppercase">{s.executor}</div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {s.alreadyExists ? (
                            <Badge variant="secondary" className="text-[10px] h-4 py-0 text-emerald-600 bg-emerald-50 border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 mr-0.5" /> Reused
                            </Badge>
                          ) : (s as any).hasScriptContent === false ? (
                            <Badge variant="outline" className="text-[10px] h-4 py-0 text-amber-600 bg-amber-500/10 border-amber-500/30">
                              <AlertTriangle className="w-3 h-3 mr-0.5" /> Missing
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] h-4 py-0 text-primary border-primary/30">
                              New
                            </Badge>
                          )}

                          {matchedPackageScript && (
                            <div className="flex items-center gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 text-muted-foreground hover:text-foreground"
                                onPress={() => setInspectingScript(matchedPackageScript)}
                                title="Inspect Script Source Code"
                              >
                                <Eye className="size-3" />
                              </Button>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 text-muted-foreground hover:text-foreground"
                                onPress={() => handleDownloadScript(matchedPackageScript)}
                                title="Download .py file"
                              >
                                <Download className="size-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Trust Gate Acknowledgment Box */}
                {hasNewCustomScripts && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 space-y-2 animate-in fade-in duration-150">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="size-4.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <div className="space-y-0.5">
                        <div className="text-xs font-semibold text-amber-950 dark:text-amber-200">
                          Security & Script Trust Gate
                        </div>
                        <p className="text-[11px] text-amber-900/80 dark:text-amber-300/80 leading-relaxed">
                          This pipeline contains <strong>custom Python code</strong> that will execute on your local workstation DCC environment via {appConfig.name} Runner. You can review the scripts or use the 1-click AI audit prompt above before granting execution trust.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
                      <Checkbox
                        isSelected={isTrusted}
                        onChange={setIsTrusted}
                        id="trust-gate-checkbox"
                      />
                      <label
                        htmlFor="trust-gate-checkbox"
                        className="text-xs font-medium text-amber-950 dark:text-amber-100 cursor-pointer select-none"
                      >
                        I have inspected the bundled Python scripts and trust their execution on this machine.
                      </label>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-3 border-t flex flex-row items-center justify-between sm:justify-between w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onPress={handleClose}
            isDisabled={importMutation.isPending}
          >
            Cancel
          </Button>

          {validationResult && (
            <Button
              type="button"
              size="sm"
              onPress={handleConfirmImport}
              isDisabled={
                !validationResult.isValid ||
                importMutation.isPending ||
                (hasNewCustomScripts && !isTrusted)
              }
              className="gap-1.5"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Importing Package...
                </>
              ) : hasNewCustomScripts ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Trust & Import {validationResult.packageMetadata.totalPipelines} Pipeline(s)
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5" />
                  Import {validationResult.packageMetadata.totalPipelines} Pipeline(s)
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </Dialog>

      {/* Script Source Code Inspector Modal */}
      {inspectingScript && (
        <InspectScriptCodeDialog
          isOpen={Boolean(inspectingScript)}
          onClose={() => setInspectingScript(null)}
          fileName={inspectingScript.fileName}
          executor={inspectingScript.executor}
          scriptContent={inspectingScript.scriptContent}
        />
      )}
    </>
  );
}
