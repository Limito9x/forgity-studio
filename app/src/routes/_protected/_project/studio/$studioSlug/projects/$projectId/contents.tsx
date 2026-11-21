import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/_project/studio/$studioSlug/projects/$projectId/contents')({
  staticData: {
    breadcrumb: 'Contents',
  },
  component: () => <Outlet />,
})
