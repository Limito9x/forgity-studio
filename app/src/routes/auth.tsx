import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getAuthState } from '@/stores/authStore'

export const Route = createFileRoute('/auth')({
  beforeLoad: () => {
    if (getAuthState().accessToken) {
      throw redirect({
        to: '/',
      })
    }
  },
  component: AuthLayout,
})

function AuthLayout() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <Outlet />
      </div>
    </div>
  )
}
