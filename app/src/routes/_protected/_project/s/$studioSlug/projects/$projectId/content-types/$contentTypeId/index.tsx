import { createFileRoute } from '@tanstack/react-router'
import { ContentTypeDetailPage } from '@/features/contentTypes/pages/ContentTypeDetailPage'

export const Route = createFileRoute('/_protected/_project/s/$studioSlug/projects/$projectId/content-types/$contentTypeId/')({
  staticData: {
    breadcrumb: 'View Details',
  },
  component: ContentTypeDetailPage,
})
