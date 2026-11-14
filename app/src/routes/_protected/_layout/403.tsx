import { createFileRoute } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/_layout/403')({
  component: ForbiddenPage,
})

function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[80vh] text-center">
      <h1 className="text-4xl font-bold mb-4">403 - Access Denied</h1>
      <p className="text-muted-foreground mb-8">
        You do not have permission to access this page.
      </p>
      <Link to="/" className="text-primary hover:underline">
        Return to Dashboard
      </Link>
    </div>
  )
}
