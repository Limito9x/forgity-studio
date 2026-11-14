import { useQueryClient, type QueryKey } from "@tanstack/react-query";

export interface ApiEnvelope<T = any> {
  status?: number;
  message?: string;
  data?: T | null;
  isSuccess?: boolean;
}

/**
 * Utility to unwrap data from the backend's Result envelope structure.
 * Can be passed directly as the `select` option in TanStack Query.
 */
export const unwrapData = <T>(res: ApiEnvelope<T>): T => {
  return res.data as T;
};

/**
 * A factory function that wraps an Orval mutation hook and automatically
 * invalidates the provided query keys upon a successful mutation.
 * 
 * @param useMutationHook The generated Orval mutation hook (e.g., useCreateUser)
 * @param queryKeysToInvalidate Array of query keys to invalidate on success
 * @returns A new React Hook that wraps the original mutation hook
 */
export function createMutationHook<TMutationHook extends (options?: any) => any>(
    useMutationHook: TMutationHook,
    queryKeysToInvalidate: readonly QueryKey[]
) {
    return function useWrappedMutation(options?: Parameters<TMutationHook>[0]): ReturnType<TMutationHook> {
        const queryClient = useQueryClient();
        
        return useMutationHook({
            ...options,
            mutation: {
                ...options?.mutation,
                onSuccess: (...args: any[]) => {
                    // Invalidate specified query keys
                    queryKeysToInvalidate.forEach((key) => {
                        queryClient.invalidateQueries({ queryKey: key });

                        // Support URL prefix matching for dynamic route queries (e.g. /api/resource-versions/...)
                        if (key.length === 1 && typeof key[0] === "string") {
                            const prefix = key[0];
                            queryClient.invalidateQueries({
                                predicate: (query) => {
                                    const first = query.queryKey[0];
                                    return typeof first === "string" && first.startsWith(prefix);
                                },
                            });
                        }
                    });
                    
                    // Call the original onSuccess if provided
                    if (options?.mutation?.onSuccess) {
                        options.mutation.onSuccess(...args);
                    }
                }
            }
        });
    };
}
