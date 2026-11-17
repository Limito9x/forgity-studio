import { createFileRoute } from '@tanstack/react-router'
import { CreateUserPage } from '@/features/users/pages/CreateUserPage'

export const Route = createFileRoute('/_protected/_layout/admin/users/new')({
  staticData: {
    breadcrumb: 'New User',
  },
  component: CreateUserPage,
})
