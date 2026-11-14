import { createFileRoute } from '@tanstack/react-router'
import { StructsPage } from '@/features/structs/StructsPage'
import { useProject } from '@/features/projects/context/ProjectContext'

export const Route = createFileRoute('/_protected/_project/s/$studioSlug/projects/$projectId/structs/')({
  component: StructsRoute,
})

function StructsRoute() {
  const { projectId } = useProject()
  return <StructsPage projectId={projectId} />
}
