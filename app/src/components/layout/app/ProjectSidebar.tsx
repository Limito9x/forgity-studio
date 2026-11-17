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
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Settings,
  Logs,
  ChevronRight,
  Folder,
  ArrowLeftRight,
  Workflow,
} from "lucide-react";
import { NavUser } from "./NavUser";
import { useRouterState } from "@tanstack/react-router";
import { useProject } from "@/features/projects/context/ProjectContext";
import { useProjectNav } from "@/lib/navigation/useProjectNav";
import { useContentTypes } from "@/features/contentTypes/hooks/useContentTypes";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { DynamicIcon } from "@/components/custom-ui/DynamicIcon";
import { featureFlags } from "@/config/featureFlags";

export function ProjectSidebar() {
  const { project, projectId } = useProject();
  const nav = useProjectNav();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  // Query content types for this project (projectId is guaranteed GUID from ProjectContext)
  const { data: contentTypesData } = useContentTypes({ PageSize: 100 } as any, projectId);

  const pipelinesBaseUrl = nav.urls.pipelines();
  const nodesBaseUrl = nav.urls.nodes();

  const isPipelineActive =
    (pathname === pipelinesBaseUrl || pathname.startsWith(`${pipelinesBaseUrl}/`)) &&
    !pathname.includes("/pipeline/nodes");
  const isNodesActive = pathname.startsWith(nodesBaseUrl);

  const isContentsParentActive = pathname.includes("/contents");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {project && (
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                onPress={() => nav.toAllProjects()}
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Folder className="size-5" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{project.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    ← Back to Studio
                  </span>
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
              {/* Pipelines (Cloud Studio Pipelines; Local Workspace moved to top-right Mode Switcher) */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Pipelines"
                  isActive={isPipelineActive || isNodesActive}
                  onPress={() => nav.toPipelines()}
                >
                  <Workflow />
                  <span>Pipelines</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Dynamic Contents & Content Types Group (Studio Catalog Feature Flag) */}
              {featureFlags.enableStudioCatalog && contentTypesData?.items && contentTypesData.items.length > 0 && (
                <SidebarMenuItem>
                  {isCollapsed ? (
                    <DropdownMenuTrigger>
                      <SidebarMenuButton
                        tooltip="Contents"
                        isActive={isContentsParentActive}
                      >
                        <Logs />
                        <span>Contents</span>
                      </SidebarMenuButton>
                      <DropdownMenu placement="right top" offset={8} className="min-w-48 max-h-72 overflow-y-auto">
                        <DropdownMenuLabel>Contents</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {contentTypesData.items.map((ct) => (
                          <DropdownMenuItem
                            key={ct.id}
                            onAction={() => nav.toContents(ct.key)}
                          >
                            <DynamicIcon name={ct.icon} className="size-4 shrink-0" />
                            <span>{ct.displayName || ct.name}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenu>
                    </DropdownMenuTrigger>
                  ) : (
                    <Collapsible
                      defaultExpanded={isContentsParentActive}
                      className="group/collapsible"
                    >
                      <SidebarMenuButton tooltip="Contents" slot="trigger">
                        <Logs />
                        <span>Contents</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[expanded]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {contentTypesData.items.map((ct) => {
                            const itemUrl = nav.urls.contents(ct.key);
                            const isItemActive = pathname.startsWith(itemUrl);
                            return (
                              <SidebarMenuSubItem key={ct.id}>
                                <SidebarMenuSubButton
                                  isActive={isItemActive}
                                  onPress={() => nav.toContents(ct.key)}
                                >
                                  <DynamicIcon name={ct.icon} className="size-4 shrink-0" />
                                  <span>{ct.displayName || ct.name}</span>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </SidebarMenuItem>
              )}

              {/* Content Types (Schema Config) - Studio Catalog Feature Flag */}
              {featureFlags.enableStudioCatalog && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(nav.urls.contentTypes())}
                    tooltip="Content Types"
                    onPress={() => nav.toContentTypes()}
                  >
                    <Settings />
                    <span>Content Types</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/* Migrations & Packages */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith(nav.urls.migrations())}
                  tooltip="Migrations"
                  onPress={() => nav.toMigrations()}
                >
                  <ArrowLeftRight />
                  <span>Migrations</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/40 p-2">
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  );
}
