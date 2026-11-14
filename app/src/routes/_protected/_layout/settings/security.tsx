import { createFileRoute } from '@tanstack/react-router'
import { SecuritySettings } from '@/features/settings/components/SecuritySettings'

export const Route = createFileRoute('/_protected/_layout/settings/security')({
  staticData: {
    breadcrumb: 'Security',
  },
  component: SecuritySettings,
})
