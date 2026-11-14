import { createFileRoute } from '@tanstack/react-router'
import { UserDetailPage } from '@/features/users/pages/UserDetailPage'

export const Route = createFileRoute('/_protected/_layout/users/$id/')({
  staticData: {
    breadcrumb: 'View Details',
  },
  component: UserDetailPage,
})
