import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getAuthState } from '@/stores/authStore'
import { ProjectProvider } from '@/features/projects/context/ProjectContext'
import { ProjectShell } from '@/components/layout/app/ProjectShell'

export const Route = createFileRoute('/_protected/_project/s/$studioSlug/projects/$projectId')({
    staticData: {
        breadcrumb: 'Projects',
    },
    beforeLoad: () => {
        const permissions = getAuthState().permissions;
        const hasAccess = permissions.some(p => p.startsWith('projects:'));
        if (!hasAccess) {
            throw redirect({ to: '/403' });
        }
    },
    component: ProjectRouteLayout,
})

function ProjectRouteLayout() {
    const { studioSlug, projectId } = Route.useParams();
    return (
        <ProjectProvider projectKeyOrId={projectId} studioSlug={studioSlug}>
            <ProjectShell>
                <Outlet />
            </ProjectShell>
        </ProjectProvider>
    );
}
