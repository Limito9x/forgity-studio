import { createFileRoute } from '@tanstack/react-router';
import { buildPagedSearchSchema } from '@/lib/schemas/pagedSearch.schema';
import { CONTENT_ITEM_FILTERABLE_FIELDS } from '@/features/contentItems/schemas/contentItemFilterableFields';
import { ContentItemPage } from '@/features/contentItems/ContentItemPage';

const contentItemsRouteSearch = buildPagedSearchSchema(CONTENT_ITEM_FILTERABLE_FIELDS).extend({
    // any additional filters specific to content items
});

export const Route = createFileRoute('/_protected/_project/s/$studioSlug/projects/$projectId/contents/$typeKey/')({
    staticData: {
        breadcrumb: (params: { typeKey?: string }) => params?.typeKey || 'Items',
    },
    validateSearch: contentItemsRouteSearch,
    component: ContentItemsRoute,
});

function ContentItemsRoute() {
    return (
        <ContentItemPage
            useSearch={Route.useSearch}
            useNavigate={Route.useNavigate}
        />
    );
}
