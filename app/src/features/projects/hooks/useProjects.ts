import { keepPreviousData } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as ProjectsApi from "@/gen/endpoints/projects/projects";
import { GetProjectsQueryParams } from "@/gen/endpoints/projects/projects.zod";
import { z } from "zod";

type projectQuery = z.infer<typeof GetProjectsQueryParams>;

export const useProjects = (params: projectQuery) => {
    return ProjectsApi.useGetProjects(params, {
        query: {
            placeholderData: keepPreviousData,
        }
    });
};

export const useGetProjectById = (id: string, studioKeyOrId?: string) => {
    return ProjectsApi.useGetProjectById(
        id,
        studioKeyOrId ? { studioKeyOrId } : undefined,
        {
            query: {
                enabled: !!id,
            }
        }
    );
};

export const useCreateProject = createMutationHook(ProjectsApi.useCreateProject, [ProjectsApi.getGetProjectsQueryKey()]);
export const useUpdateProject = createMutationHook(ProjectsApi.useUpdateProject, [ProjectsApi.getGetProjectsQueryKey()]);
export const useDeleteProject = createMutationHook(ProjectsApi.useDeleteProject, [ProjectsApi.getGetProjectsQueryKey()]);
