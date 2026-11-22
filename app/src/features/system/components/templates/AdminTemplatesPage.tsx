import { useState, useMemo } from "react";
import {
  PackagePlus,
  Sparkles,
  Search,
  Plus,
  KeyRound,
  Shield,
  Loader2,
  Trash2,
  Laptop,
  Activity,
} from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  useGetCloudTemplates,
} from "@/gen/endpoints/templates/templates";
import {
  TemplateContainerBuilder,
  type EditableTemplateInfo,
} from "./TemplateContainerBuilder";
import { TemplateQuotaManagementView } from "./TemplateQuotaManagementView";

export function AdminTemplatesPage() {
  const { data: templates = [], isLoading, refetch } = useGetCloudTemplates();
  const [search, setSearch] = useState("");
  const [isBuilderMode, setIsBuilderMode] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EditableTemplateInfo | null>(null);
  const [quotaScope, setQuotaScope] = useState<{
    open: boolean;
    templatePackageId?: string;
    templateTitle?: string;
  }>({ open: false });
  const openDialog = useDialogStore((state) => state.openDialog);

  const handleRemoveTemplate = (templateId: string, title: string) => {
    openDialog("remove-template", {
      templateId,
      title,
      onSuccess: async () => {
        await refetch();
      },
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description || "").toLowerCase().includes(q)
    );
  }, [templates, search]);

  if (quotaScope.open) {
    return (
      <div className="page-container">
        <TemplateQuotaManagementView
          templatePackageId={quotaScope.templatePackageId}
          templateTitle={quotaScope.templateTitle}
          onBack={() => {
            setQuotaScope({ open: false });
            refetch();
          }}
        />
      </div>
    );
  }

  if (isBuilderMode) {
    return (
      <div className="page-container">
        <TemplateContainerBuilder
          initialTemplate={editingTemplate}
          onBack={() => {
            setIsBuilderMode(false);
            setEditingTemplate(null);
          }}
          onSuccess={() => {
            setIsBuilderMode(false);
            setEditingTemplate(null);
            refetch();
          }}
        />
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PackagePlus className="h-6 w-6 text-primary" />
            Template Management & Packaging
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            System administration for assembling, approving, and publishing immutable Template Containers to the Catalog.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onPress={() => setQuotaScope({ open: true })}
            className="gap-1.5 text-xs cursor-pointer"
          >
            <Laptop className="h-3.5 w-3.5" />
            <span>All Machine Quotas</span>
          </Button>
          <Button
            size="sm"
            onPress={() => setIsBuilderMode(true)}
            className="gap-1.5 text-xs shadow-sm cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Template Container</span>
          </Button>
        </div>
      </div>

      {/* Search & Stats Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates in system..."
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="text-xs text-muted-foreground">
          Total published packages:{" "}
          <strong className="text-foreground">{templates.length}</strong>
        </div>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 border border-dashed rounded-xl p-8 text-center bg-muted/20">
          <Sparkles className="size-8 text-muted-foreground/60 mb-3" />
          <p className="text-sm font-semibold text-foreground">No template packages found</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Assemble ingested DAGs and scripts into a container or publish from Local Workspace.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <Card key={t.templatePackageId} className="flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">
                    v{t.versionNumber}
                  </Badge>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Limit: {t.defaultQuotaLimit ?? "∞"}
                  </span>
                </div>
                <CardTitle className="text-base font-semibold mt-1.5 line-clamp-1">
                  {t.title}
                </CardTitle>
                <CardDescription className="text-xs line-clamp-2 mt-0.5">
                  {t.description || "No description provided."}
                </CardDescription>
              </CardHeader>

              <CardContent className="flex-1 pb-3 text-xs space-y-2">
                <div className="grid grid-cols-2 gap-2 text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/50">
                  <div className="flex items-center gap-1.5">
                    <Laptop className="size-3.5 text-primary" />
                    <span>Forks: {t.forkCount ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Activity className="size-3.5 text-sky-500" />
                    <span>Global Runs: {t.totalGlobalRuns ?? 0}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="size-3.5 text-amber-500" />
                    <span>Quota: {t.quotaStrategy}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Shield className="size-3.5 text-emerald-500" />
                    <span>Public</span>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="pt-2 border-t border-border/50 flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-mono text-[10px]">
                  ID: {t.templatePackageId.slice(0, 8)}...
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    onPress={() =>
                      setQuotaScope({
                        open: true,
                        templatePackageId: t.templatePackageId,
                        templateTitle: t.title,
                      })
                    }
                  >
                    Quotas ({t.forkCount ?? 0})
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    onPress={() => {
                      setEditingTemplate({
                        templatePackageId: t.templatePackageId,
                        title: t.title,
                        description: t.description,
                        defaultQuotaLimit: t.defaultQuotaLimit,
                        versionNumber: t.versionNumber,
                      });
                      setIsBuilderMode(true);
                    }}
                  >
                    Update
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onPress={() => handleRemoveTemplate(t.templatePackageId, t.title)}
                    aria-label={`Remove ${t.title}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
