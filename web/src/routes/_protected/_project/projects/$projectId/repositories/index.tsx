import { createFileRoute } from '@tanstack/react-router'
import { RepositoryListPage } from '@/features/repositories/pages/RepositoryListPage'

export const Route = createFileRoute('/_protected/_project/projects/$projectId/repositories/')({
  component: RepositoriesRouteComponent,
})

function RepositoriesRouteComponent() {
  const { projectId } = Route.useParams()
  return <RepositoryListPage projectId={projectId} />
}
