import { createMutationHook } from "@/lib/query-utils";
import * as ProfileApi from "@/gen/endpoints/profile/profile";

export const useGetProfile = () => {
    return ProfileApi.useGetProfile();
};

export const useUpdateProfile = createMutationHook(
    ProfileApi.useUpdateProfile,
    [ProfileApi.getGetProfileQueryKey()]
);

export const useUpdateAvatar = createMutationHook(
    ProfileApi.useUpdateAvatar,
    [ProfileApi.getGetProfileQueryKey()]
);
