import { createFileRoute } from '@tanstack/react-router'
import { ProfileSettings } from '@/features/settings/components/ProfileSettings'

export const Route = createFileRoute('/_protected/_layout/settings/profile')({
  staticData: {
    breadcrumb: 'Profile',
  },
  component: ProfileSettings,
})
