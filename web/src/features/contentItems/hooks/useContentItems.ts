import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import * as ContentItemsApi from "@/gen/endpoints/content-items/content-items";
import { GetContentItemsQueryParams } from "@/gen/endpoints/content-items/content-items.zod";
import type { LookupContentItemsParams } from "@/gen/model";
import { z } from "zod";

type contentItemQuery = z.infer<typeof GetContentItemsQueryParams>;

export const useContentItems = (params: contentItemQuery, { projectId, contentTypeKey}: {
    projectId: string
    contentTypeKey: string
}) => {
    return ContentItemsApi.useGetContentItems(projectId, contentTypeKey, params, {
        query: {
            enabled: !!projectId && !!contentTypeKey,
            placeholderData: keepPreviousData,
        }
    });
};

export const useGetContentItem = (projectId: string, contentTypeKey: string, keyOrId: string) => {
    return ContentItemsApi.useGetContentItem(projectId, contentTypeKey, keyOrId, undefined, {
        query: {
            enabled: !!projectId && !!contentTypeKey && !!keyOrId,
        }
    });
};

export const useGetContentItemById = (id: string, projectId?: string, contentTypeKey?: string) => {
    return ContentItemsApi.useGetContentItem(projectId ?? "", contentTypeKey ?? "", id, undefined, {
        query: {
            enabled: !!id && !!projectId && !!contentTypeKey,
        }
    });
};


export const useCreateContentItem = (params?: { projectId?: string; contentTypeKey?: string }) => {
    const queryClient = useQueryClient();
    return ContentItemsApi.useCreateContentItem({
        mutation: {
            onSuccess: () => {
                if (params?.projectId && params?.contentTypeKey) {
                    queryClient.invalidateQueries({
                        queryKey: ContentItemsApi.getGetContentItemsQueryKey(params.projectId, params.contentTypeKey)
                    });
                }
                queryClient.invalidateQueries({
                    predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].includes("/contents")
                });
            }
        }
    });
};

export const useUpdateContentItem = (params?: { projectId?: string; contentTypeKey?: string }) => {
    const queryClient = useQueryClient();
    return ContentItemsApi.useUpdateContentItem({
        mutation: {
            onSuccess: () => {
                if (params?.projectId && params?.contentTypeKey) {
                    queryClient.invalidateQueries({
                        queryKey: ContentItemsApi.getGetContentItemsQueryKey(params.projectId, params.contentTypeKey)
                    });
                }
                queryClient.invalidateQueries({
                    predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].includes("/contents")
                });
            }
        }
    });
};

export const useDeleteContentItem = (params?: { projectId?: string; contentTypeKey?: string }) => {
    const queryClient = useQueryClient();
    return ContentItemsApi.useDeleteContentItem({
        mutation: {
            onSuccess: () => {
                if (params?.projectId && params?.contentTypeKey) {
                    queryClient.invalidateQueries({
                        queryKey: ContentItemsApi.getGetContentItemsQueryKey(params.projectId, params.contentTypeKey)
                    });
                }
                queryClient.invalidateQueries({
                    predicate: (query) => typeof query.queryKey[0] === "string" && query.queryKey[0].includes("/contents")
                });
            }
        }
    });
};

export const useLookupContentItems = (
    projectId: string,
    params?: LookupContentItemsParams,
    options?: { enabled?: boolean }
) => {
    return ContentItemsApi.useLookupContentItems(projectId, params, {
        query: {
            enabled: !!projectId && (options?.enabled ?? true),
        }
    });
};

