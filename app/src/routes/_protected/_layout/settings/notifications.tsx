import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/_layout/settings/notifications')({
  beforeLoad: () => {
    throw redirect({ to: '/settings/profile' })
  },
})
