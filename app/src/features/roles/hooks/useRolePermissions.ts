import type { DictionaryOfStringAndDictionaryOfStringAndIReadOnlyListOfString } from "@/gen/model";
import { useGetAllPermissions } from "@/gen/endpoints/permissions/permissions";
import { useGetRolePermissions, useUpdateRolePermissions } from "@/gen/endpoints/roles/roles";

export function useRolePermissions(roleId: string) {
    const { 
        data: allPermissions, 
        isLoading: isAllPermissionsLoading 
    } = useGetAllPermissions();

    const { 
        data: rolePermissions, 
        isLoading: isRolePermissionsLoading,
        refetch
    } = useGetRolePermissions(roleId, {
        query: {
            enabled: !!roleId
        }
    });

    const { 
        mutateAsync: updatePermissions, 
        isPending: isUpdating 
    } = useUpdateRolePermissions();

    const isLoading = isAllPermissionsLoading || isRolePermissionsLoading;

    return {
        // DictionaryOfStringAndDictionaryOfStringAndIReadOnlyListOfString = { [module: string]: { [feature: string]: string[] } }
        allPermissions: allPermissions as DictionaryOfStringAndDictionaryOfStringAndIReadOnlyListOfString | undefined,
        // ListOfString = string[]
        rolePermissions: rolePermissions as readonly string[] | undefined,
        updatePermissions,
        refetchRolePermissions: refetch,
        isLoading,
        isUpdating
    };
}
