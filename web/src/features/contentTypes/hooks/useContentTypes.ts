import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import * as ContentTypesApi from "@/gen/endpoints/content-types/content-types";
import { GetContentTypesQueryParams } from "@/gen/endpoints/content-types/content-types.zod";
import { z } from "zod";

type contentTypeQuery = z.infer<typeof GetContentTypesQueryParams>;

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const useContentTypes = (
    params: contentTypeQuery,
    projectId?: string,
    options?: { enabled?: boolean }
) => {
    const isValidGuid = Boolean(projectId && GUID_REGEX.test(projectId));
    return ContentTypesApi.useGetContentTypes(projectId || "", params, {
        query: {
            placeholderData: keepPreviousData,
            enabled: isValidGuid && (options?.enabled ?? true),
        }
    });
};

// Lấy content type theo id hay key đều đc
export const useGetContentType = (projectId: string, key: string) => {
    return ContentTypesApi.useGetContentType(projectId, key, {
        query: {
            enabled: Boolean(key) && Boolean(projectId),
        }
    });
};

export const useCreateContentType = ({ projectId }: { projectId: string }) => {
    const queryClient = useQueryClient();
    return ContentTypesApi.useCreateContentType({
        mutation: {
            onSuccess: () => {
                queryClient.invalidateQueries({
                    queryKey: ContentTypesApi.getGetContentTypesQueryKey(projectId),
                });
            }
        }
    });
};

export const useUpdateContentType = ({ projectId }: { projectId: string }) => {
    const queryClient = useQueryClient();
    return ContentTypesApi.useUpdateContentType({
        mutation: {
            onSuccess: () => {
                queryClient.invalidateQueries({
                    queryKey: ContentTypesApi.getGetContentTypesQueryKey(projectId),
                });
            }
        }
    });
};

export const useDeleteContentType = ({ projectId }: { projectId: string }) => {
    const queryClient = useQueryClient();
    return ContentTypesApi.useDeleteContentType({
        mutation: {
            onSuccess: () => {
                queryClient.invalidateQueries({
                    queryKey: ContentTypesApi.getGetContentTypesQueryKey(projectId),
                });
            }
        }
    });
};

export const useUpdateContentTypeSchema = ({ projectId }: { projectId: string }) => {
    const queryClient = useQueryClient();
    return ContentTypesApi.useUpdateContentTypeSchema({
        mutation: {
            onSuccess: () => {
                queryClient.invalidateQueries({
                    queryKey: ContentTypesApi.getGetContentTypesQueryKey(projectId),
                });
            }
        }
    });
};
