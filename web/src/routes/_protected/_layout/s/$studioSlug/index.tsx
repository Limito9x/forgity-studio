import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, ArrowRight, Workflow, Cpu, FolderGit2, Folder } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { appConfig } from '@/config/appConfig'
import { useProjects } from '@/features/projects/hooks/useProjects'
import { useDialogStore } from '@/stores/dialogStore'
import { useAuthStore } from '@/stores/authStore'
import { useCurrentStudio, setCurrentStudio } from '@/features/studios/hooks/useCurrentStudio'
import { getStudioById } from '@/gen/endpoints/studios/studios'

export const Route = createFileRoute('/_protected/_layout/s/$studioSlug/')({
  staticData: {
    breadcrumb: 'Dashboard',
  },
  beforeLoad: async ({ params }) => {
    try {
      const studio = await getStudioById(params.studioSlug);
      if (studio) setCurrentStudio(studio);
    } catch {
      // Fallback
    }
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { studioSlug } = Route.useParams();
  const openDialog = useDialogStore((state) => state.openDialog)
  const hasPermission = useAuthStore((state) => state.hasPermission)
  const { studioId: activeStudioId } = useCurrentStudio()

  const canCreate = hasPermission('projects:create')

  const { data: projectsData, isLoading } = useProjects({
    page: 1,
    pageSize: 6,
    studioId: activeStudioId || undefined,
  })

  const projects = projectsData?.items ?? []

  return (
    <div className="page-container space-y-6">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-r from-muted/50 via-background to-muted/30 p-8 shadow-xs">
        <div className="relative z-10 max-w-2xl space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to {appConfig.name}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Orchestrate, automate, and accelerate your 3D digital content creation pipelines.
            Connect headless Blender and Unreal Engine workers to run batch automation with ease.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            {canCreate && (
              <Button
                variant="default"
                size="lg"
                onPress={() => openDialog('create-project')}
                className="gap-2 cursor-pointer"
              >
                <Plus className="size-4" />
                <span>Create Project</span>
              </Button>
            )}
            <Link
              to="/s/$studioSlug/projects"
              params={{ studioSlug }}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors gap-2"
            >
              <span>Explore All Projects</span>
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {/* Quick Launch Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Workflow className="size-4 text-primary" />
                Pipelines & Workflows
              </CardTitle>
              <CardDescription>
                Build visual DAG graphs, manage dynamic parameters, and trigger automated 3D execution.
              </CardDescription>
            </div>
          </CardHeader>
          <CardFooter className="pt-2">
            <Link
              to="/s/$studioSlug/projects"
              params={{ studioSlug }}
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              Open Projects & Pipelines
              <ArrowRight className="size-3" />
            </Link>
          </CardFooter>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-start justify-between pb-2">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="size-4 text-primary" />
                Compute Runners
              </CardTitle>
              <CardDescription>
                Monitor workstation daemons, stage runners, and resource health for Blender & Unreal Engine.
              </CardDescription>
            </div>
          </CardHeader>
          <CardFooter className="pt-2">
            <Link
              to="/s/$studioSlug/runners"
              params={{ studioSlug }}
              className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
            >
              View Connected Runners
              <ArrowRight className="size-3" />
            </Link>
          </CardFooter>
        </Card>
      </div>

      {/* Recent Projects Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Recent Projects</h2>
            <p className="text-xs text-muted-foreground">
              Quickly jump back into your recent pipeline graphs.
            </p>
          </div>
          {projects.length > 0 && (
            <Link
              to="/s/$studioSlug/projects"
              params={{ studioSlug }}
              className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <span>View all projects</span>
              <ArrowRight className="size-3" />
            </Link>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-4 space-y-3">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-8 w-1/3" />
              </Card>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <Card className="flex flex-col items-center justify-center p-8 text-center border-dashed">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-3">
              <Folder className="size-6 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold">No projects yet</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Create your first project to organize digital assets and design automation pipelines.
            </p>
            {canCreate && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5 cursor-pointer"
                onPress={() => openDialog('create-project')}
              >
                <Plus className="size-3.5" />
                <span>Create First Project</span>
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Card
                key={project.id}
                className="hover:border-primary/50 transition-all flex flex-col justify-between"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                        <FolderGit2 className="size-4 text-muted-foreground" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <CardTitle className="text-sm truncate font-semibold">
                          {project.name}
                        </CardTitle>
                        {project.slug && (
                          <span className="text-[11px] font-mono text-muted-foreground truncate">
                            @{project.slug}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardFooter className="pt-0">
                  <Link
                    to="/s/$studioSlug/projects/$projectId/pipeline"
                    params={{ studioSlug, projectId: project.slug || project.id! }}
                    className="w-full inline-flex items-center justify-center rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 py-1.5 text-xs font-medium gap-1.5 transition-colors"
                  >
                    <span>Open Pipelines</span>
                    <ArrowRight className="size-3.5" />
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
