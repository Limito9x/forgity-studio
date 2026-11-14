import { keepPreviousData } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as UsersApi from "@/gen/endpoints/users/users";
import { GetUsersQueryParams } from "@/gen/endpoints/users/users.zod";
import { z } from "zod";

type userQuery = z.infer<typeof GetUsersQueryParams>

export const useUsers = (params: userQuery) => {
    return UsersApi.useGetUsers(params, {
        query: {
            placeholderData: keepPreviousData,
        }
    });
};

export const useGetUserById = (id: string) => {
    return UsersApi.useGetUserById(id, {
        query: {
            enabled: !!id,
        }
    });
};

export const useCreateUser = createMutationHook(UsersApi.useCreateUser, [UsersApi.getGetUsersQueryKey()]);
export const useUpdateUser = createMutationHook(UsersApi.useUpdateUser, [UsersApi.getGetUsersQueryKey()]);
export const useDeleteUser = createMutationHook(UsersApi.useDeleteUser, [UsersApi.getGetUsersQueryKey()]);
export const useAssignUserRoles = createMutationHook(UsersApi.useAssignUserRoles, [UsersApi.getGetUsersQueryKey()]);
export const useBulkInviteUsers = createMutationHook(UsersApi.useBulkInviteUsers, [UsersApi.getGetUsersQueryKey()]);