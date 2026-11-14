import { Link, useMatches, useNavigate } from "@tanstack/react-router"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { ChevronDown } from "lucide-react"
import { useOptionalProject } from "@/features/projects/context/ProjectContext"
import { useProjectNav } from "@/lib/navigation/useProjectNav"
import { useContentTypes } from "@/features/contentTypes/hooks/useContentTypes"
import { useProjects } from "@/features/projects/hooks/useProjects"
import { DynamicIcon } from "@/components/custom-ui/DynamicIcon"

export function AppBreadcrumb() {
  const matches = useMatches()
  const navigate = useNavigate()
  const projectCtx = useOptionalProject()
  const nav = useProjectNav()

  // Project content types for quick switching
  const { data: contentTypesData } = useContentTypes(
    { PageSize: 100 } as any,
    projectCtx?.projectId || ""
  )

  // Other projects in the studio for quick switcher
  const { data: projectsData } = useProjects({
    studioSlug: projectCtx?.studioSlug || undefined,
    pageSize: 50,
  })

  // Filter matches that have a breadcrumb staticData
  const breadcrumbs = matches
    .filter((match) => (match.staticData as any)?.breadcrumb)
    .map((match) => {
      const rawBreadcrumb = (match.staticData as any).breadcrumb
      const label =
        typeof rawBreadcrumb === "function"
          ? rawBreadcrumb(match.params, match.loaderData)
          : rawBreadcrumb
      return {
        label,
        path: match.pathname,
      }
    })

  if (breadcrumbs.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink>
            <Link to="/" className="transition-colors hover:text-foreground text-xs">
              Application
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1
          const lowerLabel = (item.label || "").toString().toLowerCase()

          // Quick switcher dropdown for Projects
          if (
            (lowerLabel === "projects" || lowerLabel === "project" || item.label === projectCtx?.project?.name) &&
            projectCtx?.project &&
            projectsData?.items &&
            projectsData.items.length > 1
          ) {
            return (
              <BreadcrumbItem key={item.path}>
                <DropdownMenuTrigger>
                  <button className="flex items-center gap-1 font-medium transition-colors hover:text-foreground text-xs text-muted-foreground outline-hidden">
                    <span className="truncate max-w-[140px]">{projectCtx.project.name}</span>
                    <ChevronDown className="size-3 opacity-60" />
                  </button>
                  <DropdownMenu placement="bottom start" offset={6} className="min-w-52 max-h-64 overflow-y-auto">
                    <DropdownMenuLabel>Switch Project</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {projectsData.items.map((p) => (
                      <DropdownMenuItem
                        key={p.id}
                        onAction={() =>
                          navigate({
                            to: "/s/$studioSlug/projects/$projectId/pipeline",
                            params: {
                              studioSlug: projectCtx.studioSlug,
                              projectId: p.id!,
                            },
                          })
                        }
                      >
                        <span className="truncate font-medium">{p.name}</span>
                        {p.slug && <span className="ml-auto text-[10px] text-muted-foreground">@{p.slug}</span>}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenu>
                </DropdownMenuTrigger>
              </BreadcrumbItem>
            )
          }

          // Quick switcher dropdown for Pipelines
          if (
            lowerLabel === "pipelines" ||
            lowerLabel === "all pipelines" ||
            lowerLabel === "node library"
          ) {
            return (
              <BreadcrumbItem key={item.path}>
                <DropdownMenuTrigger>
                  <button className="flex items-center gap-1 font-medium transition-colors hover:text-foreground text-xs text-muted-foreground outline-hidden capitalize">
                    <span>{item.label}</span>
                    <ChevronDown className="size-3 opacity-60" />
                  </button>
                  <DropdownMenu placement="bottom start" offset={6} className="min-w-44">
                    <DropdownMenuLabel>Pipelines</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onAction={() => nav.toPipelines()}>
                      <span>All Pipelines</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onAction={() => nav.toNodes()}>
                      <span>Node Library</span>
                    </DropdownMenuItem>
                  </DropdownMenu>
                </DropdownMenuTrigger>
              </BreadcrumbItem>
            )
          }

          // Quick switcher dropdown for Contents
          if (
            lowerLabel === "contents" &&
            contentTypesData?.items &&
            contentTypesData.items.length > 0
          ) {
            return (
              <BreadcrumbItem key={item.path}>
                <DropdownMenuTrigger>
                  <button className="flex items-center gap-1 font-medium transition-colors hover:text-foreground text-xs text-muted-foreground outline-hidden">
                    <span>Contents</span>
                    <ChevronDown className="size-3 opacity-60" />
                  </button>
                  <DropdownMenu placement="bottom start" offset={6} className="min-w-48 max-h-64 overflow-y-auto">
                    <DropdownMenuLabel>Content Types</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {contentTypesData.items.map((ct) => (
                      <DropdownMenuItem
                        key={ct.id}
                        onAction={() => nav.toContents(ct.key)}
                      >
                        <DynamicIcon name={ct.icon} className="size-3.5 shrink-0" />
                        <span>{ct.displayName || ct.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenu>
                </DropdownMenuTrigger>
              </BreadcrumbItem>
            )
          }

          return (
            <BreadcrumbItem key={item.path}>
              {isLast ? (
                <BreadcrumbPage className="capitalize text-xs font-normal">{item.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink>
                  <Link to={item.path} className="transition-colors hover:text-foreground text-xs">
                    {item.label}
                  </Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
