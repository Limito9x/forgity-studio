import { keepPreviousData } from "@tanstack/react-query";
import { createMutationHook } from "@/lib/query-utils";
import * as SystemSettingsApi from "@/gen/endpoints/system-settings/system-settings";
import { GetSystemSettingsQueryParams } from "@/gen/endpoints/system-settings/system-settings.zod";
import { z } from "zod";

type systemSettingQuery = z.infer<typeof GetSystemSettingsQueryParams>;

export const useSystemSettings = (params: systemSettingQuery) => {
    return SystemSettingsApi.useGetSystemSettings(params, {
        query: {
            placeholderData: keepPreviousData,
        }
    });
};

export const useGetSystemSettingById = (id: string) => {
    return SystemSettingsApi.useGetSystemSettingById(id, {
        query: {
            enabled: !!id,
        }
    });
};

export const useUpdateSystemSetting = createMutationHook(SystemSettingsApi.useUpdateSystemSetting, [SystemSettingsApi.getGetSystemSettingsQueryKey()]);
