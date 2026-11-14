import { createFileRoute } from "@tanstack/react-router";
import { buildPagedSearchSchema } from "@/lib/schemas/pagedSearch.schema";
import { ROLE_FILTERABLE_FIELDS } from "@/features/roles/schemas/roleFilterableFields";
import { RolePage } from "@/features/roles/RolePage";

export const rolesRouteSearch = buildPagedSearchSchema(ROLE_FILTERABLE_FIELDS);

export const Route = createFileRoute("/_protected/_layout/roles/")({
    validateSearch: rolesRouteSearch,
    component: RolesRoute,
});

function RolesRoute() {
    return (
        <RolePage
            useSearch={Route.useSearch}
            useNavigate={Route.useNavigate}
        />
    );
}
