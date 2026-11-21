import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/_layout/account/settings/notifications')({
  beforeLoad: () => {
    throw redirect({ to: '/account/settings/profile' })
  },
})
