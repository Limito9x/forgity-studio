import { useState, useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import { useRepositories } from "@/features/repositories/hooks/useRepositories";
import { useGetRepositoryResources } from "@/gen/endpoints/repositories/repositories";
import { useRunners } from "@/features/runners/hooks/useRunners";
import { useTags } from "@/features/tags/hooks/useTags";
import { useContentTypes } from "@/features/contentTypes/hooks/useContentTypes";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, FileBox, X, CheckSquare, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface EntityPinSelectProps {
  entityType?: string;
  target?: string | null;
  projectId?: string;
  value?: any;
  onChange: (value: any) => void;
  placeholder?: string;
  disabled?: boolean;
  multiple?: boolean;
}

export function EntityPinSelect({
  entityType = "",
  target,
  projectId = "",
  value,
  onChange,
  placeholder,
  disabled = false,
  multiple = false,
}: EntityPinSelectProps) {
  const routeParams = useParams({ strict: false }) as { projectId?: string };
  const effectiveProjectId = projectId || routeParams?.projectId || "";

  const normType = (target || entityType || "resource").toLowerCase().replace(/[\s_-]+/g, "");
  const isResourceRef = normType.includes("resource");
  const isContentTypeRef = normType === "contenttype" || normType.includes("contenttype");

  // 1. Repositories
  const { data: workspacesData, isLoading: isWorkspacesLoading } = useRepositories(
    normType === "workspace" || normType === "repository" || isResourceRef ? effectiveProjectId : ""
  );

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [resourceSearch, setResourceSearch] = useState<string>("");

  // 2. Resources within Selected Repository
  const { data: resourcesData, isLoading: isResourcesLoading } = useGetRepositoryResources(
    selectedWorkspaceId,
    { projectId: effectiveProjectId, workspaceId: selectedWorkspaceId, pageSize: 100, page: 1 },
    { query: { enabled: isResourceRef && Boolean(selectedWorkspaceId) } }
  );

  // 3. Runners
  const { data: agentsData, isLoading: isAgentsLoading } = useRunners();

  // 4. Tags
  const { data: tagsData, isLoading: isTagsLoading } = useTags(
    undefined,
    { enabled: normType === "tag" }
  );

  // 5. Content Types
  const { data: contentTypesData, isLoading: isContentTypesLoading } = useContentTypes(
    { pageSize: 100, page: 1 } as any,
    effectiveProjectId,
    { enabled: isContentTypeRef && Boolean(effectiveProjectId) }
  );

  // Map workspace options
  const workspaceOptions = useMemo(() => {
    const list = Array.isArray(workspacesData)
      ? workspacesData
      : (workspacesData as any)?.items || [];
    return list.map((w: any) => ({
      label: w.name || w.id,
      value: w.id,
    }));
  }, [workspacesData]);

  // Map raw resources list
  const rawResourcesList = useMemo(() => {
    return Array.isArray(resourcesData)
      ? resourcesData
      : (resourcesData as any)?.items || [];
  }, [resourcesData]);

  // Filtered resources based on search query
  const filteredResources = useMemo(() => {
    if (!resourceSearch.trim()) return rawResourcesList;
    const query = resourceSearch.toLowerCase().trim();
    return rawResourcesList.filter((r: any) => {
      const name = (r.displayName || "").toLowerCase();
      const path = (r.relativePath || "").toLowerCase();
      return name.includes(query) || path.includes(query);
    });
  }, [rawResourcesList, resourceSearch]);

  // Selected values array for multi-select
  const selectedResourceIds = useMemo<string[]>(() => {
    if (!multiple) return [];
    if (Array.isArray(value)) return value.map(String);
    if (value && typeof value === "string") return [value];
    return [];
  }, [value, multiple]);

  const handleToggleResource = (targetId: string) => {
    if (!targetId) return;
    const exists = selectedResourceIds.includes(targetId);
    const nextList = exists
      ? selectedResourceIds.filter((id) => id !== targetId)
      : [...selectedResourceIds, targetId];
    onChange(nextList);
  };

  const handleSelectAllFiltered = () => {
    const filteredTargetIds = filteredResources
      .map((r: any) => r.latestVersionId || r.id)
      .filter(Boolean);
    const allSelected = filteredTargetIds.every((id: string) => selectedResourceIds.includes(id));

    if (allSelected) {
      // Uncheck filtered
      const nextList = selectedResourceIds.filter((id) => !filteredTargetIds.includes(id));
      onChange(nextList);
    } else {
      // Check all filtered
      const merged = Array.from(new Set([...selectedResourceIds, ...filteredTargetIds]));
      onChange(merged);
    }
  };

  const handleClearAll = () => {
    onChange([]);
  };

  // Map single resource options
  const resourceOptions = useMemo(() => {
    return rawResourcesList.map((r: any) => ({
      label: r.displayName ? `${r.displayName} (${r.relativePath || `v${r.latestVersionNo || 1}`})` : r.id,
      value: r.latestVersionId || r.id,
    }));
  }, [rawResourcesList]);

  // General options based on entityType
  const options = useMemo(() => {
    switch (normType) {
      case "workspace":
        return workspaceOptions;
      case "agent": {
        const list = Array.isArray(agentsData)
          ? agentsData
          : (agentsData as any)?.items || [];
        return list.map((a: any) => ({
          label: a.name || a.id,
          value: a.id,
        }));
      }
      case "tag": {
        const list = Array.isArray(tagsData) ? tagsData : [];
        return list.map((t: any) => ({
          label: t.path ? `${t.path}` : t.name,
          value: t.path || t.id,
        }));
      }
      case "contenttype": {
        const list = Array.isArray(contentTypesData)
          ? contentTypesData
          : (contentTypesData as any)?.items || [];
        return list.map((ct: any) => ({
          label: ct.displayName ? `${ct.displayName} (${ct.name || ct.key})` : ct.name || ct.key || ct.id,
          value: ct.name || ct.key || ct.id,
        }));
      }
      default:
        return [];
    }
  }, [normType, workspaceOptions, agentsData, tagsData, contentTypesData]);

  // Resource Selector: Workspace -> Resource (Single vs Multiple)
  if (isResourceRef) {
    if (multiple) {
      const allFilteredSelected =
        filteredResources.length > 0 &&
        filteredResources.every((r: any) =>
          selectedResourceIds.includes(r.latestVersionId || r.id)
        );

      return (
        <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-3 shadow-xs">
          {/* 1. Select Workspace */}
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              1. Select Workspace
            </span>
            <BaseCombobox
              items={workspaceOptions}
              value={selectedWorkspaceId || undefined}
              onValueChange={(wId) => {
                setSelectedWorkspaceId(wId || "");
                onChange([]); // Reset selection when switching workspace
              }}
              placeholder="Select workspace to view resources..."
              disabled={disabled || isWorkspacesLoading}
              emptyText={isWorkspacesLoading ? "Loading workspaces..." : "No workspaces found."}
            />
          </div>

          {/* 2. Multi-select Resources Checklist */}
          {selectedWorkspaceId && (
            <div className="space-y-2 pt-1 border-t border-border/40">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-foreground">
                  2. Select Resources
                </span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-mono">
                    {selectedResourceIds.length} selected
                  </Badge>
                  {selectedResourceIds.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                      onClick={handleClearAll}
                      isDisabled={disabled}
                    >
                      <X className="h-3 w-3 mr-0.5" /> Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Search & Select All Bar */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="text"
                    placeholder="Search resources in workspace..."
                    value={resourceSearch}
                    onChange={(e) => setResourceSearch(e.target.value)}
                    className="h-8 pl-8 pr-2 text-xs bg-background"
                    disabled={disabled || isResourcesLoading}
                  />
                  {resourceSearch && (
                    <button
                      type="button"
                      onClick={() => setResourceSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {filteredResources.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground shrink-0"
                    onClick={handleSelectAllFiltered}
                    isDisabled={disabled || isResourcesLoading}
                  >
                    <CheckSquare className="h-3.5 w-3.5 mr-1" />
                    {allFilteredSelected ? "Deselect" : "Select All"}
                  </Button>
                )}
              </div>

              {/* Resources Checklist Container */}
              <div className="max-h-60 overflow-y-auto rounded-md border border-border/60 bg-background/80 p-1 divide-y divide-border/20">
                {isResourcesLoading ? (
                  <div className="flex items-center justify-center py-6 text-xs text-muted-foreground gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Loading workspace resources...
                  </div>
                ) : filteredResources.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground">
                    {resourceSearch ? "No resources matching search." : "No resources found in this workspace."}
                  </div>
                ) : (
                  filteredResources.map((r: any) => {
                    const targetId = String(r.latestVersionId || r.id);
                    const isChecked = selectedResourceIds.includes(targetId);

                    return (
                      <div
                        key={targetId}
                        onClick={() => !disabled && handleToggleResource(targetId)}
                        className={cn(
                          "flex items-center gap-2.5 px-2 py-1.5 rounded cursor-pointer transition-colors text-left select-none",
                          isChecked
                            ? "bg-primary/10 hover:bg-primary/15"
                            : "hover:bg-muted/50",
                          disabled && "pointer-events-none opacity-50"
                        )}
                      >
                        <Checkbox
                          isSelected={isChecked}
                          onChange={() => handleToggleResource(targetId)}
                          className="shrink-0"
                        />
                        <FileBox className={cn("h-4 w-4 shrink-0", isChecked ? "text-primary" : "text-muted-foreground")} />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-foreground truncate">
                            {r.displayName || r.name || targetId}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {r.relativePath || `Version ${r.latestVersionNo || 1}`}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Single Resource Selector: Workspace -> Resource -> Latest Version
    return (
      <div className="space-y-2">
        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground">1. Select Workspace</span>
          <BaseCombobox
            items={workspaceOptions}
            value={selectedWorkspaceId || undefined}
            onValueChange={(wId) => {
              setSelectedWorkspaceId(wId || "");
            }}
            placeholder="Select workspace first..."
            disabled={disabled || isWorkspacesLoading}
            emptyText={isWorkspacesLoading ? "Loading workspaces..." : "No workspaces found."}
          />
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-medium text-muted-foreground">2. Select Resource (Auto Latest Version)</span>
          <BaseCombobox
            items={resourceOptions}
            value={value ? String(value) : undefined}
            onValueChange={(newVal) => onChange(newVal || null)}
            placeholder={selectedWorkspaceId ? "Select resource file..." : "Select workspace above first..."}
            disabled={disabled || !selectedWorkspaceId || isResourcesLoading}
            emptyText={isResourcesLoading ? "Loading resources..." : "No resources found in this workspace."}
          />
        </div>
      </div>
    );
  }

  const isLoading =
    (normType === "workspace" && isWorkspacesLoading) ||
    (normType === "agent" && isAgentsLoading) ||
    (normType === "tag" && isTagsLoading) ||
    (isContentTypeRef && isContentTypesLoading);

  return (
    <BaseCombobox
      items={options}
      value={value ? String(value) : undefined}
      onValueChange={(newVal) => onChange(newVal || null)}
      placeholder={placeholder || `Select ${entityType}...`}
      disabled={disabled || isLoading}
      emptyText={isLoading ? "Loading..." : `No ${entityType} found.`}
    />
  );
}
