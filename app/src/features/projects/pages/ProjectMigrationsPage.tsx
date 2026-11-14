import { useState } from "react";
import { useProject } from "@/features/projects/context/ProjectContext";
import { useProjectMigrationHistory } from "@/features/projects/hooks/useProjectMigrations";
import { UnifiedMigrationWizardDialog } from "@/features/projects/dialogs/UnifiedMigrationWizardDialog";
import { Button } from "@/components/ui/button";
import {
  Download,
  Upload,
  ArrowLeftRight,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProjectMigrationLogDto } from "@/gen/model";

export function ProjectMigrationsPage() {
  const { project, projectId } = useProject();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<"export" | "import">("export");
  const [page] = useState(1);

  const { data, isLoading, refetch, isRefetching } = useProjectMigrationHistory(projectId, {
    page,
    pageSize: 20,
  });

  const logs = (data?.items || []) as ProjectMigrationLogDto[];

  const openExport = () => {
    setWizardMode("export");
    setWizardOpen(true);
  };

  const openImport = () => {
    setWizardMode("import");
    setWizardOpen(true);
  };

  const renderStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "success":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="size-3.5" />
            <span>Success</span>
          </span>
        );
      case "partialsuccess":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <AlertTriangle className="size-3.5" />
            <span>Partial</span>
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
            <XCircle className="size-3.5" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
            <Clock className="size-3.5" />
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="page-container space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-border/60">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <ArrowLeftRight className="size-6 text-primary" />
            <span>Project Migrations & Transfer</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Export standalone bundles (<code>.forgity.pkg</code>) with full python scripts, or import assets from another project/studio.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onPress={() => refetch()}
            isDisabled={isRefetching}
            className="gap-2 cursor-pointer"
          >
            <RefreshCw className={cn("size-3.5", isRefetching && "animate-spin")} />
            <span>Refresh</span>
          </Button>

          <Button variant="outline" size="sm" onPress={openImport} className="gap-2 cursor-pointer">
            <Upload className="size-3.5" />
            <span>Import Package</span>
          </Button>

          <Button variant="default" size="sm" onPress={openExport} className="gap-2 cursor-pointer">
            <Download className="size-3.5" />
            <span>Export Package</span>
          </Button>
        </div>
      </div>

      {/* History Table */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">Audit & Transfer History</h2>

        <div className="rounded-xl border border-border/70 overflow-hidden bg-card shadow-xs">
          <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-muted/40 text-muted-foreground border-b border-border/70 text-xs font-semibold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Package File</th>
                <th className="py-3 px-4">Domains</th>
                <th className="py-3 px-4">Size</th>
                <th className="py-3 px-4">Triggered At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    Loading migration logs...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    <FileArchive className="size-8 mx-auto mb-2 text-muted-foreground/60" />
                    <div>No migration records yet.</div>
                    <p className="text-xs mt-1">
                      Export or import your first package above to begin tracking history.
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-semibold text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border/60">
                        {log.type}
                      </span>
                    </td>
                    <td className="py-3 px-4">{renderStatusBadge(log.status)}</td>
                    <td className="py-3 px-4 font-mono text-xs text-foreground truncate max-w-[240px]">
                      {log.packageFileName}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {log.selectedDomains.map((d) => (
                          <span
                            key={d}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">
                      {(log.packageSizeBytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Migration Wizard Modal */}
      {project && (
        <UnifiedMigrationWizardDialog
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          projectId={projectId}
          projectName={project.name}
          initialMode={wizardMode}
        />
      )}
    </div>
  );
}

