import { useMemo } from "react";
import { useParams } from "@tanstack/react-router";
import { useOptionalProject } from "@/features/projects/context/ProjectContext";
import { BaseCombobox } from "@/components/custom-ui/inputs/combobox/BaseCombobox";
import { useRepositories } from "@/features/repositories/hooks/useRepositories";
import { useRunners } from "@/features/runners/hooks/useRunners";
import { useTags } from "@/features/tags/hooks/useTags";
import { useContentTypes } from "@/features/contentTypes/hooks/useContentTypes";
import { useLookupContentItems } from "@/features/contentItems/hooks/useContentItems";
import { ResourceWorkstationSelect } from "./ResourceWorkstationSelect";

export interface EntityPinSelectProps {
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
  const projectCtx = useOptionalProject();
  const routeParams = useParams({ strict: false }) as { projectId?: string };
  const effectiveProjectId = projectId || projectCtx?.projectId || routeParams?.projectId || "";

  const resolvedTarget = (target || entityType || "Resource").trim();
  const isResource = resolvedTarget === "Resource";
  const isRepository = resolvedTarget === "Repository";
  const isRunner = resolvedTarget === "Runner";
  const isContentType = resolvedTarget === "ContentType";
  const isContentItem = resolvedTarget === "ContentItem";
  const isTag = resolvedTarget === "Tag";

  // Repositories
  const { data: repositoriesData, isLoading: isRepositoriesLoading } = useRepositories(
    isRepository ? effectiveProjectId : ""
  );

  // Runners
  const { data: runnersData, isLoading: isRunnersLoading } = useRunners();

  // Tags
  const { data: tagsData, isLoading: isTagsLoading } = useTags(
    undefined,
    { enabled: isTag }
  );

  // Content Types
  const { data: contentTypesData, isLoading: isContentTypesLoading } = useContentTypes(
    { pageSize: 100, page: 1 } as any,
    effectiveProjectId,
    { enabled: isContentType && Boolean(effectiveProjectId) }
  );

  // Content Items
  const { data: contentItemsData, isLoading: isContentItemsLoading } = useLookupContentItems(
    effectiveProjectId,
    { limit: 100 },
    { enabled: isContentItem && Boolean(effectiveProjectId) }
  );

  // 1. Delegate Resource (Workstation Root -> Draft Resource) to specialized component
  if (isResource) {
    return (
      <ResourceWorkstationSelect
        projectId={effectiveProjectId}
        value={value}
        onChange={onChange}
        disabled={disabled}
        multiple={multiple}
      />
    );
  }

  // 2. Map options for other entities
  const options = useMemo(() => {
    if (isRepository) {
      const list = Array.isArray(repositoriesData)
        ? repositoriesData
        : (repositoriesData as any)?.items || [];
      return list.map((w: any) => ({
        label: w.name || w.id,
        value: w.id,
      }));
    }

    if (isRunner) {
      const list = Array.isArray(runnersData)
        ? runnersData
        : (runnersData as any)?.items || [];
      return list.map((a: any) => ({
        label: a.name || a.machineKey || a.id,
        value: a.id,
      }));
    }

    if (isTag) {
      const list = Array.isArray(tagsData) ? tagsData : [];
      return list.map((t: any) => ({
        label: t.path ? `${t.path}` : t.name,
        value: t.path || t.id,
      }));
    }

    if (isContentType) {
      const list = Array.isArray(contentTypesData)
        ? contentTypesData
        : (contentTypesData as any)?.items || [];
      return list.map((ct: any) => ({
        label: ct.displayName ? `${ct.displayName} (${ct.name || ct.key})` : ct.name || ct.key || ct.id,
        value: ct.name || ct.key || ct.id,
      }));
    }

    if (isContentItem) {
      const list = Array.isArray(contentItemsData) ? contentItemsData : [];
      return list.map((item: any) => ({
        label: item.contentTypeName ? `${item.name} (${item.contentTypeName})` : item.name,
        value: item.id,
      }));
    }

    return [];
  }, [
    isRepository,
    isRunner,
    isTag,
    isContentType,
    isContentItem,
    repositoriesData,
    runnersData,
    tagsData,
    contentTypesData,
    contentItemsData,
  ]);

  const isLoading =
    (isRepository && isRepositoriesLoading) ||
    (isRunner && isRunnersLoading) ||
    (isTag && isTagsLoading) ||
    (isContentType && isContentTypesLoading) ||
    (isContentItem && isContentItemsLoading);

  const displayLabel = resolvedTarget || "Entity";

  return (
    <div className="space-y-1">
      <BaseCombobox
        items={options}
        value={value ? String(value) : undefined}
        onValueChange={(newVal) => onChange(newVal || null)}
        placeholder={isLoading ? `Loading ${displayLabel.toLowerCase()}...` : placeholder || `Select ${displayLabel}...`}
        disabled={disabled || isLoading}
        isLoading={isLoading}
        emptyText={isLoading ? "Loading..." : `No ${displayLabel.toLowerCase()} found.`}
      />
    </div>
  );
}
