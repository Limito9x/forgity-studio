import { createFileRoute, redirect } from "@tanstack/react-router";
import { SystemSettingsPage } from "@/features/system/components/settings/SystemSettingsPage";
import { buildPagedSearchSchema } from "@/lib/schemas/pagedSearch.schema";
import { SYSTEM_SETTING_FILTERABLE_FIELDS } from "@/features/system/schemas/systemSettingFilterableFields";

export const systemSettingsRouteSearch = buildPagedSearchSchema(SYSTEM_SETTING_FILTERABLE_FIELDS);

import { getAuthState } from '@/stores/authStore'

export const Route = createFileRoute("/_protected/_layout/system/settings")({
    validateSearch: systemSettingsRouteSearch,
    staticData: {
        breadcrumb: "System Settings",
    },
    beforeLoad: () => {
        const permissions = getAuthState().permissions;
        const hasAccess = permissions.some(p => p.startsWith('systemsettings:'));
        if (!hasAccess) {
            throw redirect({ to: '/403' });
        }
    },
    component: SystemSettingsPageRoute,
});

function SystemSettingsPageRoute() {
    return <SystemSettingsPage useSearch={Route.useSearch} useNavigate={Route.useNavigate} />;
}
