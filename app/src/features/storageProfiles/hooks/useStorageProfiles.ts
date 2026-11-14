import { keepPreviousData } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as StorageProfilesApi from "@/gen/endpoints/storage-profiles/storage-profiles";

export const useStorageProfiles = (studioId?: string) => {
  return StorageProfilesApi.useGetStorageProfiles(
    { studioId: studioId! },
    {
      query: {
        enabled: !!studioId,
        placeholderData: keepPreviousData,
      },
    }
  );
};

export const useCreateStorageProfile = createMutationHook(
  StorageProfilesApi.useCreateStorageProfile,
  [StorageProfilesApi.getGetStorageProfilesQueryKey()]
);

export const useUpdateStorageProfile = createMutationHook(
  StorageProfilesApi.useUpdateStorageProfile,
  [StorageProfilesApi.getGetStorageProfilesQueryKey()]
);

export const useDeleteStorageProfile = createMutationHook(
  StorageProfilesApi.useDeleteStorageProfile,
  [StorageProfilesApi.getGetStorageProfilesQueryKey()]
);

export const useTestStorageConnection = () => {
  return StorageProfilesApi.useTestStorageConnection();
};
