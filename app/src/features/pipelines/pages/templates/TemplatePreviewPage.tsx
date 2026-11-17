import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useGetCloudTemplates,
  useAddTemplateToLibrary,
} from "@/gen/endpoints/templates/templates";
import { PipelineCanvas } from "../../components/canvas/PipelineCanvas";
import {
  extractConstantFields,
  templateRootToPipelineGraphDto,
} from "../../adapters/templateGraphAdapter";

interface TemplatePreviewPageProps {
  templateId: string;
  machineKey?: string;
}

export function TemplatePreviewPage({
  templateId,
  machineKey = "local-workstation",
}: TemplatePreviewPageProps) {
  const navigate = useNavigate();
  const { data: templates = [], isLoading, refetch } = useGetCloudTemplates();
  const addToLibrary = useAddTemplateToLibrary();
  const [isAdding, setIsAdding] = useState(false);

  const tpl = useMemo(
    () => templates.find((t) => t.templatePackageId === templateId),
    [templates, templateId]
  );

  const graph = useMemo(() => {
    if (!tpl) return null;
    return templateRootToPipelineGraphDto(
      tpl.templatePackageId,
      tpl.title,
      tpl.rootPipelineJson,
      tpl.contractsJson
    );
  }, [tpl]);

  const constantFields = useMemo(
    () => (tpl ? extractConstantFields(tpl.contractsJson) : []),
    [tpl]
  );

  const handleAdd = async () => {
    if (!tpl) return;
    setIsAdding(true);
    try {
      const item = await addToLibrary.mutateAsync({
        templatePackageId: tpl.templatePackageId,
        data: { machineKey },
      });
      await refetch();
      toast.success(`Added "${tpl.title}" to My Library.`);
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

  if (!tpl || !graph) {
    return (
      <div className="page-container space-y-4">
        <Button variant="ghost" onPress={() => navigate({ to: "/templates" as any })}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Templates
        </Button>
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          Template not found.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      {/* Top Preview Header */}
      <div className="flex items-center justify-between gap-4 border-b bg-background px-4 py-2.5">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onPress={() => navigate({ to: "/templates" as any })}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Catalog
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold">{tpl.title}</h1>
              <Badge variant="secondary">{tpl.category}</Badge>
              {tpl.defaultQuotaLimit != null && (
                <Badge variant="outline">Quota: {tpl.defaultQuotaLimit} runs</Badge>
              )}
            </div>
            {tpl.description && (
              <p className="truncate text-xs text-muted-foreground">{tpl.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {tpl.isAddedToLibrary && tpl.libraryItemId ? (
            <Button
              size="sm"
              onPress={() =>
                navigate({
                  to: "/templates/library/$libraryItemId" as any,
                  params: { libraryItemId: tpl.libraryItemId! } as any,
                })
              }
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Open in My Library
            </Button>
          ) : (
            <Button size="sm" isDisabled={isAdding} onPress={handleAdd}>
              {isAdding ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-4 w-4" />
              )}
              Add to My Library
            </Button>
          )}
        </div>
      </div>

      {/* Split Canvas + Required Constants Panel */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 h-full overflow-hidden">
          <PipelineCanvas
            projectId="cloud-template"
            graph={graph}
            paletteItems={(tpl.contractsJson as any)?.nodes || []}
            readOnly
          />
        </div>

        <aside className="w-80 shrink-0 border-l bg-background p-4 overflow-y-auto space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" />
            Required Constants ({constantFields.length})
          </div>
          <p className="text-xs text-muted-foreground">
            Personal constant values are stripped from public templates. You will bind your own Constant Profile in My Library.
          </p>

          {constantFields.length === 0 ? (
            <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground text-center">
              No external constants required.
            </div>
          ) : (
            <div className="space-y-2">
              {constantFields.map((c) => (
                <div key={c.key} className="rounded-lg border border-border/60 p-2.5 bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{c.label}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {c.dataType}
                    </Badge>
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">{c.key}</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
