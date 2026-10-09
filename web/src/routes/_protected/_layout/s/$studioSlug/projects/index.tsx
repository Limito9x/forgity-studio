import { createFileRoute } from "@tanstack/react-router";
import { buildPagedSearchSchema } from "@/lib/schemas/pagedSearch.schema";
import { PROJECT_FILTERABLE_FIELDS } from "@/features/projects/schemas/projectFilterableFields";
import { ProjectPage } from "@/features/projects/ProjectPage";

export const studioProjectsRouteSearch = buildPagedSearchSchema(PROJECT_FILTERABLE_FIELDS);

export const Route = createFileRoute("/_protected/_layout/s/$studioSlug/projects/")({
    validateSearch: studioProjectsRouteSearch,
    component: StudioProjectsRoute,
});

function StudioProjectsRoute() {
    return (
        <ProjectPage
            useSearch={Route.useSearch as any}
            useNavigate={Route.useNavigate as any}
        />
    );
}
