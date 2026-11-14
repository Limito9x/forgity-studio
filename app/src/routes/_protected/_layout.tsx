import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/app/AppShell'
import { getAuthState } from '@/stores/authStore'

export const Route = createFileRoute('/_protected/_layout')({
  beforeLoad: ({ location }) => {
    if (!getAuthState().accessToken) {
      throw redirect({
        to: '/auth/login',
        search: () => ({ redirect: location.href }),
      })
    }
  },
  component: LayoutComponent,
})

function LayoutComponent() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
