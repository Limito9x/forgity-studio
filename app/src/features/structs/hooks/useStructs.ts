import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import * as StructsApi from "@/gen/endpoints/structs/structs";
import type {
    CreateStructCommand,
    GetProjectStructsParams,
    StructDetailDto,
    StructSummaryDto,
    UpdateStructCommand
} from "@/gen/model";

export type {
    CreateStructCommand,
    GetProjectStructsParams,
    StructDetailDto,
    StructSummaryDto,
    UpdateStructCommand
};

export const useGetProjectStructs = (
    projectId?: string,
    params?: GetProjectStructsParams,
    options?: { enabled?: boolean }
) => {
    return StructsApi.useGetProjectStructs(projectId || "", params, {
        query: {
            placeholderData: keepPreviousData,
            enabled: Boolean(projectId) && (options?.enabled ?? true),
        }
    });
};

export const useGetStructById = (
    projectId: string,
    structId: string,
    options?: { enabled?: boolean }
) => {
    return StructsApi.useGetStructById(projectId, structId, {
        query: {
            enabled: Boolean(structId) && Boolean(projectId) && (options?.enabled ?? true),
        }
    });
};

export const useCreateStruct = ({ projectId }: { projectId: string }) => {
    const queryClient = useQueryClient();
    return StructsApi.useCreateStruct({
        mutation: {
            onSuccess: () => {
                queryClient.invalidateQueries({
                    queryKey: StructsApi.getGetProjectStructsQueryKey(projectId),
                });
            }
        }
    });
};

export const useUpdateStruct = ({ projectId }: { projectId: string }) => {
    const queryClient = useQueryClient();
    return StructsApi.useUpdateStruct({
        mutation: {
            onSuccess: (_data, variables) => {
                queryClient.invalidateQueries({
                    queryKey: StructsApi.getGetProjectStructsQueryKey(projectId),
                });
                if (variables.id) {
                    queryClient.invalidateQueries({
                        queryKey: StructsApi.getGetStructByIdQueryKey(projectId, variables.id),
                    });
                }
            }
        }
    });
};

export const useDeleteStruct = ({ projectId }: { projectId: string }) => {
    const queryClient = useQueryClient();
    return StructsApi.useDeleteStruct({
        mutation: {
            onSuccess: () => {
                queryClient.invalidateQueries({
                    queryKey: StructsApi.getGetProjectStructsQueryKey(projectId),
                });
            }
        }
    });
};
