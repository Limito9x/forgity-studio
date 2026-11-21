import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/_project/studio/$studioSlug/projects/$projectId/contents/')({
  beforeLoad: ({ params: { studioSlug, projectId } }) => {
    throw redirect({
      to: '/studio/$studioSlug/projects/$projectId/content-types',
      params: { studioSlug, projectId },
    })
  },
})
