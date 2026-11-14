import { createFileRoute } from '@tanstack/react-router'
import { ContentTypeSchemaBuilderPage } from '@/features/contentTypes/ContentTypeSchemaBuilderPage'
import { useProject } from '@/features/projects/context/ProjectContext'

export const Route = createFileRoute('/_protected/_project/s/$studioSlug/projects/$projectId/content-types/$contentTypeId/builder')({
    component: RouteContentTypeSchemaBuilderPage,
})

function RouteContentTypeSchemaBuilderPage() {
    const { projectId } = useProject();
    const { contentTypeId } = Route.useParams();
    return <ContentTypeSchemaBuilderPage projectId={projectId} contentTypeId={contentTypeId} />
}