import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getAuthState } from '@/stores/authStore'

export const Route = createFileRoute('/_protected/_layout/system/audit-logs')({
  staticData: {
    breadcrumb: 'Audit Logs',
  },
  beforeLoad: () => {
    const permissions = getAuthState().permissions;
    const hasAccess = permissions.some(p => p.startsWith('auditlogs:'));
    if (!hasAccess) {
      throw redirect({ to: '/403' });
    }
  },
  component: () => <Outlet />,
})
