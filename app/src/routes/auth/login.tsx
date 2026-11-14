import { createFileRoute } from '@tanstack/react-router'
import { LoginForm } from '@/features/auth'
import { loginSearchSchema } from '@/lib/schemas/auth.schema'

export const Route = createFileRoute('/auth/login')({
  validateSearch: loginSearchSchema,
  component: LoginPage,
})

function LoginPage() {
  return <LoginForm />
}
