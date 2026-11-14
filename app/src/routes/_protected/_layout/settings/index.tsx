import { createFileRoute } from '@tanstack/react-router'
import { SettingsIndex } from '@/features/settings/components/SettingsIndex'

export const Route = createFileRoute('/_protected/_layout/settings/')({
  staticData: {
    breadcrumb: 'Settings',
  },
  component: SettingsIndex,
})
