import { createFileRoute, Outlet } from '@tanstack/react-router';
import { getContentType } from '@/gen/endpoints/content-types/content-types';

export const Route = createFileRoute('/_protected/_project/s/$studioSlug/projects/$projectId/contents/$typeKey')({
    loader: async ({ params: { projectId, typeKey } }) => {
        try {
            const contentType = await getContentType(projectId, typeKey);
            return { contentType };
        } catch {
            return { contentType: null };
        }
    },
    component: () => <Outlet />,
});
