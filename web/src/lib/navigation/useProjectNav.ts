import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import { useOptionalProject } from "@/features/projects/context/ProjectContext";

export interface ProjectNavOptions {
  studioSlug?: string;
  projectId?: string;
}

/**
 * Project Navigation Facade Hook
 * Centralizes all project-scoped URL generation and programmatic navigation.
 * Prevents hardcoding route strings across components and shields against future route restructuring.
 */
export function useProjectNav(options?: ProjectNavOptions) {
  const navigate = useNavigate();
  const projectCtx = useOptionalProject();
  const params = useParams({ strict: false }) as {
    studioSlug?: string;
    projectId?: string;
  };
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // 1. Resolve studioSlug: options -> projectCtx -> route param -> regex from path -> active studio fallback
  const { studioSlug: currentStudioSlug } = useCurrentStudio();
  let resolvedStudioSlug = options?.studioSlug || projectCtx?.studioSlug || params.studioSlug;
  if (!resolvedStudioSlug) {
    const match = pathname.match(/\/s\/([^/]+)/);
    if (match) resolvedStudioSlug = match[1];
  }
  const studioSlug = resolvedStudioSlug || currentStudioSlug || "";

  // 2. Resolve projectId (GUID for queries) & urlProjectKey (slug or id for URL)
  let resolvedProjectId = options?.projectId || projectCtx?.projectId;
  if (!resolvedProjectId) {
    let rawKeyOrId = params.projectId;
    if (!rawKeyOrId) {
      const match = pathname.match(/\/projects\/([^/]+)/);
      if (match) rawKeyOrId = match[1];
    }
    resolvedProjectId = rawKeyOrId || "";
  }
  const projectId = resolvedProjectId;

  // Use slug for clean URLs if available, otherwise fallback to projectId
  const urlProjectKey = projectCtx?.projectSlug || options?.projectId || projectId;

  // Base URL pattern for current project scope
  const projectBase = studioSlug
    ? `/s/${studioSlug}/projects/${urlProjectKey}`
    : `/projects/${urlProjectKey}`;

  const studioBase = studioSlug ? `/s/${studioSlug}` : "";

  // 3. Centralized URL Builders
  const urls = {
    // Studio level
    allProjects: () => `${studioBase}/projects`,
    runners: () => `${studioBase}/runners`,
    dashboard: () => `${studioBase}`,

    // Pipelines
    pipelines: () => `${projectBase}/pipeline`,
    pipelineDetail: (pipelineId: string) => `${projectBase}/pipeline/${pipelineId}`,
    nodes: () => `${projectBase}/pipeline/nodes`,
    nodeNew: (editNodeId?: string) =>
      `${projectBase}/pipeline/nodes/new${editNodeId ? `?editNodeId=${editNodeId}` : ""}`,
    nodeIngest: () => `${projectBase}/pipeline/nodes/ingest`,

    // Repositories
    repositories: () => `${projectBase}/repositories`,
    repositoryDetail: (repositoryId: string) => `${projectBase}/repositories/${repositoryId}`,
    resourceDetail: (resourceId: string, workspaceId?: string) =>
      `${projectBase}/resources/${resourceId}${workspaceId ? `?workspaceId=${workspaceId}` : ""}`,

    // Content Types
    contentTypes: () => `${projectBase}/content-types`,
    contentTypeDetail: (contentTypeId: string) => `${projectBase}/content-types/${contentTypeId}`,
    contentTypeBuilder: (contentTypeId: string) => `${projectBase}/content-types/${contentTypeId}/builder`,

    // Content Items
    contents: (typeKey?: string) =>
      typeKey ? `${projectBase}/contents/${typeKey}` : `${projectBase}/content-types`,
    contentItemNew: (typeKey: string) => `${projectBase}/contents/${typeKey}/new`,
    contentItemEdit: (typeKey: string, itemKey: string) =>
      `${projectBase}/contents/${typeKey}/${itemKey}/edit`,

    // Structs
    structs: () => `${projectBase}/structs`,
    structBuilder: (structId: string) => `${projectBase}/structs/${structId}/builder`,
  };

  // Helper for type-agnostic safe navigation
  const navTo = (url: string) => {
    navigate({ to: url as any });
  };

  return {
    studioSlug,
    projectId,
    projectBase,
    urls,

    // Navigation Methods
    toAllProjects: () => navTo(urls.allProjects()),
    toRunners: () => navTo(urls.runners()),
    toDashboard: () => navTo(urls.dashboard()),

    // Pipelines
    toPipelines: () => navTo(urls.pipelines()),
    toPipeline: (pipelineId: string) => navTo(urls.pipelineDetail(pipelineId)),
    toNodes: () => navTo(urls.nodes()),
    toNodeNew: (editNodeId?: string) => navTo(urls.nodeNew(editNodeId)),
    toNodeIngest: () => navTo(urls.nodeIngest()),

    // Repositories
    toRepositories: () => navTo(urls.repositories()),
    toRepositoryDetail: (repositoryId: string) => navTo(urls.repositoryDetail(repositoryId)),
    toResourceDetail: (resourceId: string, workspaceId?: string) =>
      navTo(urls.resourceDetail(resourceId, workspaceId)),

    // Content Types
    toContentTypes: () => navTo(urls.contentTypes()),
    toContentTypeDetail: (contentTypeId: string) => navTo(urls.contentTypeDetail(contentTypeId)),
    toContentTypeBuilder: (contentTypeId: string) => navTo(urls.contentTypeBuilder(contentTypeId)),

    // Content Items
    toContents: (typeKey?: string) => navTo(urls.contents(typeKey)),
    toContentItemNew: (typeKey: string) => navTo(urls.contentItemNew(typeKey)),
    toContentItemEdit: (typeKey: string, itemKey: string) =>
      navTo(urls.contentItemEdit(typeKey, itemKey)),

    // Structs
    toStructs: () => navTo(urls.structs()),
    toStructBuilder: (structId: string) => navTo(urls.structBuilder(structId)),

    // Smart Back
    toBack: (fallbackUrl?: string) => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        navTo(fallbackUrl || urls.pipelines());
      }
    },
  };
}
