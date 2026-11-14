import { createFileRoute } from '@tanstack/react-router'
import { UpdateUserPage } from '@/features/users/pages/UpdateUserPage'

export const Route = createFileRoute('/_protected/_layout/users/$id/edit')({
  staticData: {
    breadcrumb: 'Edit User',
  },
  component: UpdateUserPage,
})
