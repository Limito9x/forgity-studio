import * as TagsApi from "@/gen/endpoints/tags/tags";
import type {
    GetTagsParams,
    GetTagTreeParams,
    GetTagLinksParams,
    TagItemDto,
    TagLinkDto,
    TagTreeNodeDto,
    CreateTagCommand,
    CreateTagLinkCommand,
    UpdateTagCommand,
    DeleteTagCommand,
} from "@/gen/model";
import { createMutationHook } from "@/lib/query-utils";
import { keepPreviousData, useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationOptions, UseMutationResult } from "@tanstack/react-query";
import { customInstance } from "@/lib/api-client";
import type { ErrorResponse } from "@/gen/model/errorResponse";

export type {
    TagItemDto,
    TagLinkDto,
    TagTreeNodeDto,
    CreateTagCommand,
    CreateTagLinkCommand,
    UpdateTagCommand,
    DeleteTagCommand,
};

// 1. Queries
export const useTags = (
    params?: GetTagsParams,
    options?: { enabled?: boolean }
) => {
    return TagsApi.useGetTags(params, {
        query: {
            enabled: options?.enabled ?? true,
            placeholderData: keepPreviousData,
        },
    });
};

export const useTagTree = (
    params: GetTagTreeParams,
    options?: { enabled?: boolean }
) => {
    return TagsApi.useGetTagTree(params, {
        query: {
            enabled: options?.enabled ?? Boolean(params.projectId),
            placeholderData: keepPreviousData,
        },
    });
};

export const useTagLinks = (
    params: GetTagLinksParams,
    options?: { enabled?: boolean }
) => {
    return TagsApi.useGetTagLinks(params, {
        query: {
            enabled: options?.enabled ?? Boolean(params.entityType && params.entityId),
            placeholderData: keepPreviousData,
        },
    });
};

// 2. Mutations
export const useCreateTag = createMutationHook(TagsApi.useCreateTag, [
    TagsApi.getGetTagsQueryKey(),
    TagsApi.getGetTagTreeQueryKey(),
]);

export const useUpdateTag = createMutationHook(TagsApi.useUpdateTag, [
    TagsApi.getGetTagsQueryKey(),
    TagsApi.getGetTagTreeQueryKey(),
]);

export const useDeleteTag = createMutationHook(TagsApi.useDeleteTag, [
    TagsApi.getGetTagsQueryKey(),
    TagsApi.getGetTagTreeQueryKey(),
]);

export const useCreateTagLink = createMutationHook(TagsApi.useCreateTagLink, [
    TagsApi.getGetTagLinksQueryKey(),
    TagsApi.getGetTagsQueryKey(),
    ["/api/resources"],
    ["/api/resource-versions"],
]);

export const useDeleteTagLink = createMutationHook(TagsApi.useDeleteTagLink, [
    TagsApi.getGetTagLinksQueryKey(),
    ["/api/resources"],
    ["/api/resource-versions"],
]);

// TODO: orval regen — manual until /openapi/v1.json updated (POST /api/tags/bulk)
// Sau khi restart BE, chạy `pnpm --filter web gen:api` rồi thay bằng:
// export const useCreateTagsBulk = createMutationHook(TagsApi.useCreateTagsBulk, [TagsApi.getGetTagsQueryKey(), TagsApi.getGetTagTreeQueryKey()]);

export interface TagBulkRowPayload {
    name: string;
    color?: string | null;
}
export interface CreateTagsBulkPayload {
    projectId: string;
    parentPath?: string | null;
    rows: TagBulkRowPayload[];
}
export interface BulkRowErrorDto {
    index: number;
    name: string;
    reason: string;
}
export interface CreateTagsBulkResultDto {
    created: TagItemDto[];
    failed: BulkRowErrorDto[];
}

export const createTagsBulk = (payload: CreateTagsBulkPayload) =>
    customInstance<CreateTagsBulkResultDto>({
        url: `/api/tags/bulk`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: payload,
    });

export function useCreateTagsBulk(
    options?: { mutation?: UseMutationOptions<CreateTagsBulkResultDto, ErrorResponse, CreateTagsBulkPayload> }
): UseMutationResult<CreateTagsBulkResultDto, ErrorResponse, CreateTagsBulkPayload> {
    const queryClient = useQueryClient();
    return useMutation<CreateTagsBulkResultDto, ErrorResponse, CreateTagsBulkPayload>({
        mutationKey: ["createTagsBulk"],
        mutationFn: (payload) => createTagsBulk(payload),
        onSuccess: (...args) => {
            queryClient.invalidateQueries({ queryKey: TagsApi.getGetTagsQueryKey() });
            queryClient.invalidateQueries({ queryKey: TagsApi.getGetTagTreeQueryKey() });
            options?.mutation?.onSuccess?.(...(args as Parameters<NonNullable<typeof options.mutation.onSuccess>>));
        },
        ...options?.mutation,
    });
}
