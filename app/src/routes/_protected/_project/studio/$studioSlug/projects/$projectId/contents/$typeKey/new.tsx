import { createFileRoute } from '@tanstack/react-router';
import { CreateContentItemPage } from '@/features/contentItems/CreateContentItemPage';

export const Route = createFileRoute('/_protected/_project/studio/$studioSlug/projects/$projectId/contents/$typeKey/new')({
    component: ContentItemCreateRoute,
});

function ContentItemCreateRoute() {
    return <CreateContentItemPage />;
}
