import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Sparkles,
  Search,
  CheckCircle2,
  Plus,
  Eye,
  ArrowRight,
  Workflow,
  KeyRound,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getEffectiveMachineKey } from "@/lib/platform/filePickerStrategy";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useGetCloudTemplates,
  useAddTemplateToLibrary,
} from "@/gen/endpoints/templates/templates";

export function TemplatesCatalogPage({ machineKey = "local-workstation" }: { machineKey?: string }) {
  const navigate = useNavigate();
  const { data: templates = [], isLoading, refetch } = useGetCloudTemplates();
  const addToLibrary = useAddTemplateToLibrary();

  const [search, setSearch] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
      );
    });
  }, [templates, search]);

  const handleAddToLibrary = async (templatePackageId: string) => {
    setAddingId(templatePackageId);
    try {
      const effectiveKey =
        machineKey && machineKey !== "local-workstation"
          ? machineKey
          : await getEffectiveMachineKey();
      const item = await addToLibrary.mutateAsync({
        templatePackageId,
        data: { machineKey: effectiveKey },
      });
      await refetch();
      toast.success(`Added "${item.title}" to My Library.`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to add template to My Library.");
    } finally {
      setAddingId(null);
    }
  };

  return (
    <div className="page-container space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Templates Catalog
          </h1>
          <p className="text-sm text-muted-foreground">
            Browse published automation templates, inspect their node graph, and add them to My Library.
          </p>
        </div>

        <Button
          variant="outline"
          onPress={() => navigate({ to: "/templates/library" as any })}
        >
          Go to My Library
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="pl-8"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-52 animate-pulse bg-muted/30" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No templates found. Publish a pipeline from Local or Studio Editor to see it here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tpl) => {
            return (
              <Card key={tpl.templatePackageId} className="flex flex-col justify-between border-border/70">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base line-clamp-1">{tpl.title}</CardTitle>
                  </div>
                  <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                    {tpl.description || "No description provided."}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1 font-mono">
                      <Workflow className="h-3.5 w-3.5" />
                      v{tpl.versionNumber}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1">
                      <KeyRound className="h-3.5 w-3.5" />
                      {tpl.quotaStrategy}
                    </span>
                    {tpl.defaultQuotaLimit != null && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-1">
                        Quota: {tpl.defaultQuotaLimit} runs
                      </span>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="flex items-center justify-between gap-2 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() =>
                      navigate({
                        to: "/templates/$templateId" as any,
                        params: { templateId: tpl.templatePackageId } as any,
                      })
                    }
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Preview
                  </Button>

                  {tpl.isAddedToLibrary && tpl.libraryItemId ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() =>
                        navigate({
                          to: "/templates/library/$libraryItemId" as any,
                          params: { libraryItemId: tpl.libraryItemId! } as any,
                        })
                      }
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                      Open in Library
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      isDisabled={addingId === tpl.templatePackageId}
                      onPress={() => handleAddToLibrary(tpl.templatePackageId)}
                    >
                      {addingId === tpl.templatePackageId ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Add to My Library
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
