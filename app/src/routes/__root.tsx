import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import '@/lib/api-client'
import { AppProvider } from '@/providers/AppProvider'
import { loginSearchSchema } from '@/lib/schemas/auth.schema'
import { AppUpdateBanner } from '@/components/layout/app/AppUpdateBanner'

export const Route = createRootRoute({
  validateSearch: loginSearchSchema,
  component: () => (
    <AppProvider>
      <Outlet />
      <AppUpdateBanner />
      <Toaster position="top-right" richColors />
    </AppProvider>
  ),
})

