import { keepPreviousData } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as ProjectsApi from "@/gen/endpoints/projects/projects";
import type { GetProjectMigrationHistoryParams } from "@/gen/model";

export const useProjectMigrationHistory = (
  projectId: string,
  params?: GetProjectMigrationHistoryParams,
) => {
  return ProjectsApi.useGetProjectMigrationHistory(projectId, params, {
    query: {
      enabled: !!projectId,
      placeholderData: keepPreviousData,
    },
  });
};

export const useExportProjectPackage = createMutationHook(
  ProjectsApi.useExportProjectPackage,
  [["/api/projects"]]
);

export const useImportProjectPackage = createMutationHook(
  ProjectsApi.useImportProjectPackage,
  [["/api/projects"]]
);
