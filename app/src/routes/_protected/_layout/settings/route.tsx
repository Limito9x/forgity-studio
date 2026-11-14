import { createFileRoute } from '@tanstack/react-router'
import { SettingsLayout } from '@/features/settings/layout/SettingsLayout'

export const Route = createFileRoute('/_protected/_layout/settings')({
  component: SettingsLayout,
})
