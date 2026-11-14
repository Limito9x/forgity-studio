import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_protected/_project/s/$studioSlug/projects/$projectId/contents/$typeKey')({
    component: () => <Outlet />,
});
