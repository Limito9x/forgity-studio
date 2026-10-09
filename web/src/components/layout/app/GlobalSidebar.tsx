import { startTransition } from "react";
import { useAuthStore } from "@/stores/authStore";
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
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarGroupAction,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Users, Settings2, Shield, Settings, MonitorCog, Logs, Cpu, Plus, FolderKanban, FolderGit2 } from "lucide-react";
import { NavUser } from "./NavUser";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useProjects } from "@/features/projects/hooks/useProjects";
import { useDialogStore } from "@/stores/dialogStore";

const navItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard
  },
  {
    title: "Runners",
    url: "/runners",
    icon: Cpu,
    featurePrefix: "runner:"
  },
  {
    title: "Identity",
    icon: Settings2,
    items: [
      { title: "Users", url: "/users", icon: Users, featurePrefix: "users:" },
      { title: "Roles", url: "/roles", icon: Shield, featurePrefix: "roles:" },
    ]
  },
  {
    title: "System",
    icon: MonitorCog,
    items: [
      { title: "Audit Logs", url: "/system/audit-logs", icon: Logs, featurePrefix: "auditlogs:" },
      { title: "Settings", url: "/system/settings", icon: Settings, featurePrefix: "systemsettings:" },
    ]
  }
] as const;

import { StudioSwitcher } from "@/features/studios/components/StudioSwitcher";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";

export function GlobalSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const hasAnyPermission = useAuthStore(state => state.hasAnyPermission);
  const { studioId: activeStudioId, studioSlug: activeStudioSlug } = useCurrentStudio();
  const { data: projectsData } = useProjects({
    pageSize: 10,
    page: 1,
    studioId: activeStudioId || undefined,
  });

  const allProjectsUrl = activeStudioSlug ? `/s/${activeStudioSlug}/projects` : "/projects";

  const handleNav = (url: string) => {
    startTransition(() => {
      navigate({ to: url as any });
    });
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border/40 pb-2">
        <StudioSwitcher />
      </SidebarHeader>
      <SidebarContent>
        {/* Projects Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupAction title="Create Project" onClick={() => useDialogStore.getState().openDialog("create-project")}>
            <Plus /> <span className="sr-only">Create Project</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/projects" || (activeStudioSlug ? pathname === `/s/${activeStudioSlug}/projects` : false)}
                  onPress={() => handleNav(allProjectsUrl)}
                >
                  <FolderKanban className="size-4" />
                  <span>All Projects</span>
                </SidebarMenuButton>
                {projectsData?.items && projectsData.items.length > 0 && (
                  <SidebarMenuSub className="my-1 mr-0 ml-3.5 px-1.5 border-l border-border/50">
                    {projectsData.items.map((project) => {
                      const isProjectActive =
                        pathname.startsWith(`/projects/${project.id}`) ||
                        (project.slug ? pathname.includes(`/projects/${project.slug}`) : false);

                      return (
                        <SidebarMenuSubItem key={project.id}>
                          <SidebarMenuSubButton
                            isActive={isProjectActive}
                            onPress={() =>
                              handleNav(
                                activeStudioSlug
                                  ? `/s/${activeStudioSlug}/projects/${project.slug || project.id}/pipeline`
                                  : `/projects/${project.id}/pipeline`
                              )
                            }
                          >
                            <FolderGit2 className="size-3.5 text-muted-foreground" />
                            <span className="truncate">{project.name}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Application Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;

                if (!("items" in item)) {
                  const featurePrefix = "featurePrefix" in item ? (item as any).featurePrefix : undefined;
                  if (featurePrefix && !hasAnyPermission(featurePrefix)) {
                    return null;
                  }

                  let targetUrl: string = item.url;
                  let isItemActive = pathname === item.url;

                  if (item.title === "Dashboard") {
                    targetUrl = activeStudioSlug ? `/s/${activeStudioSlug}` : "/";
                    isItemActive = pathname === "/" || (activeStudioSlug ? pathname === `/s/${activeStudioSlug}` : false);
                  } else if (item.title === "Runners") {
                    targetUrl = activeStudioSlug ? `/s/${activeStudioSlug}/runners` : "/runners";
                    isItemActive = pathname === "/runners" || (activeStudioSlug ? pathname === `/s/${activeStudioSlug}/runners` : false);
                  }

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={isItemActive}
                        onPress={() => handleNav(targetUrl)}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                const visibleSubItems = item.items.filter(subItem => {
                  return !subItem.featurePrefix || hasAnyPermission(subItem.featurePrefix);
                });

                if (visibleSubItems.length === 0) {
                  return null;
                }

                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton>
                      <Icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      {visibleSubItems.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            isActive={pathname.startsWith(subItem.url)}
                            onPress={() => handleNav(subItem.url)}
                          >
                            <subItem.icon />
                            <span>{subItem.title}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                )
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
