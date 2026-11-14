import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getAuthState } from '@/stores/authStore'

export const Route = createFileRoute('/_protected/_layout/users')({
  staticData: {
    breadcrumb: 'Users',
  },
  beforeLoad: () => {
    const permissions = getAuthState().permissions;
    const hasAccess = permissions.some(p => p.startsWith('users:'));
    if (!hasAccess) {
      throw redirect({ to: '/403' });
    }
  },
  component: () => <Outlet />,
})
