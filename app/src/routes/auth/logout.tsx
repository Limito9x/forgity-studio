import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAuthState } from '@/stores/authStore'

export const Route = createFileRoute('/auth/logout')({
  beforeLoad: () => {
    getAuthState().clearToken()
    throw redirect({
      to: '/auth/login',
    })
  },
})
