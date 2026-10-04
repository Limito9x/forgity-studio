import { keepPreviousData } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as RepositoriesApi from "@/gen/endpoints/repositories/repositories";
import * as RepositoryRunnersApi from "@/gen/endpoints/repository-runners/repository-runners";
import * as ResourcesApi from "@/gen/endpoints/resources/resources";
import type {
  RepositoryDto,
  RepositoryDetailDto,
  RepositoryRunnerDto,
  ResourceItemDto,
  ResourceVersionDto,
  ResourceVersionLocationDto,
  WorkspaceResourceDto,
  GetRepositoryResourcesParams,
  CreateRepositoryCommand,
  UpdateRepositoryRequest,
  AttachRunnerToRepositoryCommand,
  DiffResult,
  SyncLocalChangesCommand,
  SyncLocalChangesResultDto,
} from "@/gen/model";

export type {
  RepositoryDto,
  RepositoryDetailDto,
  RepositoryRunnerDto,
  ResourceItemDto,
  ResourceVersionDto,
  ResourceVersionLocationDto,
  WorkspaceResourceDto,
  CreateRepositoryCommand,
  UpdateRepositoryRequest,
  AttachRunnerToRepositoryCommand,
  DiffResult,
  SyncLocalChangesCommand,
  SyncLocalChangesResultDto,
};

export const useRepositories = (projectId: string) => {
  return RepositoriesApi.useGetRepositories(
    { projectId },
    {
      query: {
        enabled: !!projectId,
        placeholderData: keepPreviousData,
      },
    },
  );
};

export const useRepositoryDetail = (repositoryId: string) => {
  return RepositoriesApi.useGetRepositoryById(repositoryId, {
    query: {
      enabled: !!repositoryId,
    },
  });
};

export const useCreateRepository = (projectId?: string) => {
  const queryKey = projectId
    ? RepositoriesApi.getGetRepositoriesQueryKey({ projectId })
    : ["repositories"];
  return createMutationHook(RepositoriesApi.useCreateRepository, [queryKey])();
};

export const useUpdateRepository = (projectId?: string) => {
  const queryKey = projectId
    ? RepositoriesApi.getGetRepositoriesQueryKey({ projectId })
    : ["repositories"];
  return createMutationHook(RepositoriesApi.useUpdateRepository, [queryKey])();
};

export const useDeleteRepository = (projectId?: string) => {
  const queryKey = projectId
    ? RepositoriesApi.getGetRepositoriesQueryKey({ projectId })
    : ["repositories"];
  return createMutationHook(RepositoriesApi.useDeleteRepository, [queryKey])();
};

export const useAttachRunnerToRepository = (repositoryId?: string) => {
  const queryKey = repositoryId
    ? RepositoriesApi.getGetRepositoryByIdQueryKey(repositoryId)
    : ["repositories"];
  return createMutationHook(RepositoryRunnersApi.useAttachRunnerToRepository, [
    queryKey,
  ])();
};

export const useCompareRepositoryResources = () => {
  return createMutationHook(
    RepositoryRunnersApi.useCompareRepositoryResources,
    [],
  )();
};

export const useSyncLocalChanges = (repositoryId?: string) => {
  const queryKeys = repositoryId
    ? [
        RepositoriesApi.getGetRepositoryByIdQueryKey(repositoryId),
        ["repositories", repositoryId, "resources"],
        [`/api/repositories/${repositoryId}/resources`],
      ]
    : [["repositories"]];
  return createMutationHook(
    RepositoryRunnersApi.useSyncLocalChanges,
    queryKeys,
  )();
};

export const useRepositoryResources = (
  repositoryId: string,
  projectId: string,
  params?: Partial<GetRepositoryResourcesParams>,
) => {
  return RepositoriesApi.useGetRepositoryResources(
    repositoryId,
    {
      projectId,
      workspaceId: repositoryId,
      page: 1,
      pageSize: 100,
      ...params,
    },
    {
      query: {
        enabled: !!repositoryId && !!projectId,
        placeholderData: keepPreviousData,
      },
    },
  );
};

export const useResourceDetail = (resourceId: string) => {
  return ResourcesApi.useGetResourceById(resourceId, {
    query: {
      enabled: !!resourceId,
    },
  });
};

export const useAssignResourcesContent = (repositoryId?: string) => {
  const queryKeys = repositoryId
    ? [
        RepositoriesApi.getGetRepositoryByIdQueryKey(repositoryId),
        ["repositories", repositoryId, "resources"],
        [`/api/repositories/${repositoryId}/resources`],
      ]
    : [["repositories"]];
  return createMutationHook(ResourcesApi.useAssignResourcesContent, queryKeys)();
};

