import { createFileRoute } from '@tanstack/react-router'
import { RepositoryListPage } from '@/features/repositories/pages/RepositoryListPage'
import { useProject } from '@/features/projects/context/ProjectContext'

export const Route = createFileRoute('/_protected/_project/s/$studioSlug/projects/$projectId/repositories/')({
  component: RepositoriesRouteComponent,
})

function RepositoriesRouteComponent() {
  const { projectId } = useProject()
  return <RepositoryListPage projectId={projectId} />
}
