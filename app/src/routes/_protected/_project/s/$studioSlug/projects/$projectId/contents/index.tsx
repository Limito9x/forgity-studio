import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/_project/s/$studioSlug/projects/$projectId/contents/')({
  beforeLoad: ({ params: { studioSlug, projectId } }) => {
    throw redirect({
      to: '/s/$studioSlug/projects/$projectId/content-types',
      params: { studioSlug, projectId },
    })
  },
})
