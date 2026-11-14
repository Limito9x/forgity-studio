import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Toaster } from 'sonner'
import '@/lib/api-client'
import { AppProvider } from '@/providers/AppProvider'
import { loginSearchSchema } from '@/lib/schemas/auth.schema'

export const Route = createRootRoute({
  validateSearch: loginSearchSchema,
  component: () => (
    <AppProvider>
      <Outlet />
      <Toaster position="top-right" richColors />
    </AppProvider>
  ),
})

