import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getAuthState } from '@/stores/authStore'

export const Route = createFileRoute('/_protected/_project/s/$studioSlug/projects/$projectId/content-types')({
  staticData: {
    breadcrumb: 'Content Types',
  },
  beforeLoad: () => {
    const permissions = getAuthState().permissions;
    const hasAccess = permissions.some(p => p.startsWith('contenttypes:'));
    if (!hasAccess) {
      throw redirect({ to: '/403' });
    }
  },
  component: () => <Outlet />,
})
