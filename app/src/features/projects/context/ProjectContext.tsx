import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useParams } from "@tanstack/react-router";
import { useGetProjectById } from "@/features/projects/hooks/useProjects";
import type { ProjectDto } from "@/gen/model";
import { Loader2 } from "lucide-react";

export interface ProjectContextValue {
  project: ProjectDto | null;
  projectId: string; // Guaranteed GUID when loaded
  projectSlug: string;
  projectKeyOrId: string;
  studioSlug: string;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function ProjectProvider({
  children,
  projectKeyOrId,
  studioSlug,
}: {
  children: ReactNode;
  projectKeyOrId?: string;
  studioSlug?: string;
}) {
  const params = useParams({ strict: false }) as {
    projectId?: string;
    studioSlug?: string;
  };

  const resolvedKeyOrId = projectKeyOrId || params.projectId || "";
  const resolvedStudioSlug = studioSlug || params.studioSlug || "";

  const isGuid = GUID_REGEX.test(resolvedKeyOrId);

  const { data: project, isLoading } = useGetProjectById(
    resolvedKeyOrId,
    resolvedStudioSlug
  );

  const resolvedProjectId = project?.id || (isGuid ? resolvedKeyOrId : "");

  const value = useMemo<ProjectContextValue>(
    () => ({
      project: project || null,
      projectId: resolvedProjectId,
      projectSlug: project?.slug || resolvedKeyOrId,
      projectKeyOrId: resolvedKeyOrId,
      studioSlug: resolvedStudioSlug,
      isLoading: !isGuid && isLoading,
    }),
    [project, resolvedProjectId, resolvedKeyOrId, resolvedStudioSlug, isGuid, isLoading]
  );

  // If URL used a slug and project is still loading, show a neat spinner to prevent child queries from firing with invalid GUID
  if (!isGuid && isLoading && !project) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="size-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Resolving project...</span>
        </div>
      </div>
    );
  }

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within a ProjectProvider");
  }
  return context;
}

export function useOptionalProject(): ProjectContextValue | null {
  return useContext(ProjectContext);
}
