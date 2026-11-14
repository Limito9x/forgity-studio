import * as RolesApi from "@/gen/endpoints/roles/roles";
import { createMutationHook } from "@/lib/query-utils";

export const useRoles = (params: any) => {
    return RolesApi.useGetRoles(params, {
        query: {
            placeholderData: (previousData) => previousData
        }
    });
};

export const useRoleOptions = () => {
    const query = RolesApi.useGetRoleOptions();
    
    return {
        ...query,
        data: query.data?.map((role: any) => ({
            label: role.name,
            value: role.id
        })) || []
    };
};

export const useRole = (id: string) => {
    return RolesApi.useGetRoleById(id, {
        query: {
            enabled: !!id,
        }
    });
};

export const useCreateRole = createMutationHook(RolesApi.useCreateRole, [RolesApi.getGetRolesQueryKey()]);
export const useUpdateRole = createMutationHook(RolesApi.useUpdateRole, [RolesApi.getGetRolesQueryKey()]);
export const useDeleteRole = createMutationHook(RolesApi.useDeleteRole, [RolesApi.getGetRolesQueryKey()]);
