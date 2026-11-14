import { createFileRoute } from "@tanstack/react-router";
import { buildPagedSearchSchema } from "@/lib/schemas/pagedSearch.schema";
import { CONTENT_TYPE_FILTERABLE_FIELDS } from "@/features/contentTypes/schemas/contentTypeFilterableFields";
import { ContentTypePage } from "@/features/contentTypes/ContentTypePage";
import { useProject } from "@/features/projects/context/ProjectContext";

export const contentTypesRouteSearch = buildPagedSearchSchema(CONTENT_TYPE_FILTERABLE_FIELDS);

export const Route = createFileRoute("/_protected/_project/s/$studioSlug/projects/$projectId/content-types/")({
    validateSearch: contentTypesRouteSearch,
    component: ContentTypesRoute,
});

function ContentTypesRoute() {
    const { projectId } = useProject();

    return (
        <ContentTypePage
            projectId={projectId}
            useSearch={Route.useSearch}
            useNavigate={Route.useNavigate}
        />
    );
}
