import { startTransition } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Settings, Logs, ChevronRight, Workflow, Cpu, Boxes, FolderGit2, Folder } from "lucide-react";
import { NavUser } from "./NavUser";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useGetProjectById } from "@/features/projects/hooks/useProjects";
import { useContentTypes } from "@/features/contentTypes/hooks/useContentTypes";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { DynamicIcon } from "@/components/custom-ui/DynamicIcon";

export function ProjectSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const currentProjectId = pathname.split("/")[2];
  const { data: currentProject } = useGetProjectById(currentProjectId);
  const { data: contentTypesData } = useContentTypes({ PageSize: 100 } as any, currentProjectId);

  const projectNavItems = [
    {
      title: "Overview",
      url: `/projects/${currentProjectId}/overview`,
      icon: LayoutDashboard
    },
    {
      title: "Repositories",
      url: `/projects/${currentProjectId}/repositories`,
      icon: FolderGit2
    },
    {
      title: "Pipelines",
      url: `/projects/${currentProjectId}/pipeline`,
      icon: Workflow
    },
    {
      title: "Content Types",
      url: `/projects/${currentProjectId}/content-types`,
      icon: Settings
    },
    {
      title: "Structs",
      url: `/projects/${currentProjectId}/structs`,
      icon: Boxes
    },
    {
      title: "Contents",
      url: `/projects/${currentProjectId}/contents`,
      icon: Logs
    },
    {
      title: "Executor Settings",
      url: `/projects/${currentProjectId}/executor-settings`,
      icon: Cpu
    }
  ];

  const handleNav = (url: string) => {
    startTransition(() => {
      navigate({ to: url });
    });
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {currentProject && (
              <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground" onPress={() => handleNav("/projects")}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Folder className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{currentProject.name}</span>
                  <span className="truncate text-xs text-muted-foreground">Back to all projects</span>
                </div>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Project Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projectNavItems.map((item) => {
                const Icon = item.icon;
                const isContents = item.title === "Contents";
                const isPipelines = item.title === "Pipelines";

                if (isPipelines) {
                  const isPipelineActive =
                    pathname === `/projects/${currentProjectId}/pipeline` ||
                    (pathname.startsWith(`/projects/${currentProjectId}/pipeline/`) &&
                      !pathname.includes("/pipeline/nodes"));
                  const isNodesActive = pathname.startsWith(
                    `/projects/${currentProjectId}/pipeline/nodes`
                  );

                  return (
                    <SidebarMenuItem key={item.title}>
                      <Collapsible
                        defaultExpanded={pathname.startsWith(`/projects/${currentProjectId}/pipeline`)}
                        className="group/collapsible"
                      >
                        <SidebarMenuButton tooltip={item.title} slot="trigger">
                          <Icon />
                          <span>{item.title}</span>
                          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[expanded]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton isActive={isPipelineActive}>
                                <Link
                                  to="/projects/$projectId/pipeline"
                                  params={{ projectId: currentProjectId }}
                                >
                                  <span>All Pipelines</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                            <SidebarMenuSubItem>
                              <SidebarMenuSubButton isActive={isNodesActive}>
                                <Link
                                  to="/projects/$projectId/pipeline/nodes"
                                  params={{ projectId: currentProjectId }}
                                >
                                  <span>Node Library</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </Collapsible>
                    </SidebarMenuItem>
                  );
                }

                if (isContents) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <Collapsible
                        defaultExpanded={pathname.startsWith(item.url)}
                        className="group/collapsible"
                      >
                        <SidebarMenuButton tooltip={item.title} slot="trigger">
                          <Icon />
                          <span>{item.title}</span>
                          <ChevronRight className="ml-auto transition-transform duration-200 group-data-[expanded]/collapsible:rotate-90" />
                        </SidebarMenuButton>
                        <CollapsibleContent>
                          {contentTypesData?.items && contentTypesData.items.length > 0 && (
                            <SidebarMenuSub>
                              {contentTypesData.items.map(ct => {
                                const isActive = pathname.startsWith(`/projects/${currentProjectId}/contents/${ct.key}`);
                                if (!ct.key) return null;
                                return (
                                  <SidebarMenuSubItem key={ct.id}>
                                    <SidebarMenuSubButton
                                      isActive={isActive}
                                    >
                                      <Link to="/projects/$projectId/contents/$typeKey" params={{ projectId: currentProjectId, typeKey: ct.key }} className="flex items-center gap-2 w-full">
                                        <DynamicIcon name={ct.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        <span className="truncate">{ct.displayName || ct.name}</span>
                                      </Link>
                                    </SidebarMenuSubButton>
                                  </SidebarMenuSubItem>
                                );
                              })}
                            </SidebarMenuSub>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </SidebarMenuItem>
                  );
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      isActive={pathname.startsWith(item.url)}
                      onPress={() => handleNav(item.url)}
                    >
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
