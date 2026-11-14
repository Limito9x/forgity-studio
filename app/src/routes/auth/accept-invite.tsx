import { createFileRoute } from '@tanstack/react-router'
import { AcceptInviteForm } from '@/features/auth'
import { resetPasswordSearchSchema } from '@/lib/schemas/auth.schema'

export const Route = createFileRoute('/auth/accept-invite')({
  validateSearch: resetPasswordSearchSchema,
  component: AcceptInvitePage,
})

function AcceptInvitePage() {
  const search = Route.useSearch()
  
  return <AcceptInviteForm email={search.email} token={search.token} />
}
