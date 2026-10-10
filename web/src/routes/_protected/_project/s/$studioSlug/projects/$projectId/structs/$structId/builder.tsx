import { createFileRoute } from '@tanstack/react-router'
import { StructSchemaBuilderPage } from '@/features/structs/StructSchemaBuilderPage'
import { useProject } from '@/features/projects/context/ProjectContext'

export const Route = createFileRoute(
  '/_protected/_project/s/$studioSlug/projects/$projectId/structs/$structId/builder',
)({
  component: RouteStructSchemaBuilderPage,
})

function RouteStructSchemaBuilderPage() {
  const { projectId } = useProject()
  const { structId } = Route.useParams()
  return <StructSchemaBuilderPage projectId={projectId} structId={structId} />
}
