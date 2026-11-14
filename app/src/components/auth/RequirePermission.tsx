import { useAuthStore } from '@/stores/authStore'
import React from 'react'

interface RequirePermissionProps {
  permission: string
  children: React.ReactNode
}

export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const hasPermission = useAuthStore(state => state.hasPermission(permission))

  if (!hasPermission) {
    return null
  }

  return <>{children}</>
}
