import { createFileRoute } from '@tanstack/react-router'
import { ResetPasswordForm } from '@/features/auth'
import { resetPasswordSearchSchema } from '@/lib/schemas/auth.schema'

export const Route = createFileRoute('/auth/reset-password')({
  validateSearch: resetPasswordSearchSchema,
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const search = Route.useSearch()
  
  return <ResetPasswordForm email={search.email} token={search.token} />
}
