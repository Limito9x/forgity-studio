import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useGetCloudTemplates,
  useGetTemplateContainerById,
  useAddTemplateToLibrary,
} from "@/gen/endpoints/templates/templates";
import { PipelineCanvas } from "../../components/canvas/PipelineCanvas";
import { TemplateOutliner } from "../../components/templates/TemplateOutliner";
import { useTemplateGraph } from "../../hooks/useTemplateGraph";

interface TemplatePreviewPageProps {
  templateId: string;
  machineKey?: string;
}

export function TemplatePreviewPage({
  templateId,
  machineKey = "local-workstation",
}: TemplatePreviewPageProps) {
  const navigate = useNavigate();
  const { data: templates = [], refetch: refetchList } = useGetCloudTemplates();
  const { data: detail, isLoading } = useGetTemplateContainerById(templateId);
  const addToLibrary = useAddTemplateToLibrary();

  const [isAdding, setIsAdding] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const summary = useMemo(
    () => templates.find((t) => t.templatePackageId === templateId),
    [templates, templateId]
  );

  // Tự động chọn Master Pipeline đầu tiên khi tải xong
  useEffect(() => {
    if (!detail) return;
    if (selectedVersionId && detail.members.some((m) => m.pipelineVersionId === selectedVersionId)) {
      return;
    }
    const firstMaster = detail.members.find((m) => m.role === "master");
    const initial =
      detail.primaryMasterVersionId ||
      firstMaster?.pipelineVersionId ||
      detail.members[0]?.pipelineVersionId ||
      null;
    setSelectedVersionId(initial);
  }, [detail, selectedVersionId]);

  const {
    graph,
    isLoading: isGraphLoading,
    isError: isGraphError,
  } = useTemplateGraph(selectedVersionId);

  const constantDeclarations = detail?.constants || [];

  const handleAdd = async () => {
    if (!detail) return;
    setIsAdding(true);
    try {
      const item = await addToLibrary.mutateAsync({
        templatePackageId: detail.templatePackageId,
        data: { machineKey },
      });
      await refetchList();
      toast.success(`Added "${detail.title}" to My Library.`);
      navigate({
        to: "/templates/library/$libraryItemId" as any,
        params: { libraryItemId: item.id } as any,
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to add template to My Library.");
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
        Loading template preview...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-muted-foreground">Template not found.</p>
        <Button variant="outline" size="sm" onPress={() => navigate({ to: "/templates" as any })}>
          Back to Catalog
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-background shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => navigate({ to: "/templates" as any })}
            className="gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="size-4" />
            <span>Catalog</span>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold truncate">{detail.title}</h1>
              <Badge variant="outline" className="text-[10px]">
                {detail.category || "General"}
              </Badge>
              <Badge variant="secondary" className="text-[10px] font-mono">
                v{detail.versionNumber}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                Quota: {detail.defaultQuotaLimit != null ? `${detail.defaultQuotaLimit} runs` : "Unlimited"}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {summary?.isAddedToLibrary && summary.libraryItemId ? (
            <Button
              size="sm"
              variant="outline"
              onPress={() =>
                navigate({
                  to: "/templates/library/$libraryItemId" as any,
                  params: { libraryItemId: summary.libraryItemId! } as any,
                })
              }
              className="gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="size-3.5 text-emerald-500" />
              <span>Open in My Library</span>
            </Button>
          ) : (
            <Button size="sm" onPress={handleAdd} isDisabled={isAdding} className="gap-1.5 cursor-pointer">
              {isAdding ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              <span>Add to Library</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Content: Left Outliner + Canvas + Right Constants */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <TemplateOutliner
          members={detail.members}
          selectedVersionId={selectedVersionId}
          onSelect={setSelectedVersionId}
        />

        {/* Center Canvas */}
        <div className="flex-1 min-w-0 min-h-0">
          {isGraphLoading ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Loading pipeline graph...</span>
            </div>
          ) : isGraphError ? (
            <div className="flex h-full items-center justify-center text-xs text-destructive">
              Failed to load pipeline graph.
            </div>
          ) : graph ? (
            <PipelineCanvas
              projectId="template-preview"
              graph={graph as any}
              readOnly={true}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground px-4 text-center">
              <span>Graph data is empty for this pipeline version.</span>
              <span className="text-[11px] opacity-75">
                If this template was packaged before snapshot ingestion, re-publish it from Admin.
              </span>
            </div>
          )}
        </div>

        {/* Right Constants (.env) */}
        <aside className="w-72 border-l border-border/60 bg-background/50 p-4 overflow-y-auto shrink-0 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <KeyRound className="size-4 text-amber-500" />
            <span>Constants (.env) ({constantDeclarations.length})</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            When you add this template to My Library, a personal <code className="font-mono">.env</code> Constant Profile will be created for you.
          </p>

          {constantDeclarations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
              No external constants required.
            </div>
          ) : (
            <div className="space-y-2">
              {constantDeclarations.map((c) => (
                <div
                  key={c.key}
                  className="rounded-lg border border-border/60 bg-card p-2.5 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{c.label || c.key}</span>
                    {c.isRequired && (
                      <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/40">
                        Priority *
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate">
                    {c.key} · {c.dataType}
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
