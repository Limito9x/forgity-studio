import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import './lib/i18n'
import './lib/api-client'
import './index.css'
import { appConfig } from './config/appConfig'

document.title = appConfig.name

// Import the generated route tree
import { routeTree } from './routeTree.gen'
import { NotFoundPage } from './components/layout/errors/NotFoundPage'
import { ErrorPage } from './components/layout/errors/ErrorPage'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultNotFoundComponent: NotFoundPage,
  defaultErrorComponent: ({ error }) => <ErrorPage error={error} />,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
