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
import { LayoutDashboard, Users, Settings2, Shield, Settings, MonitorCog, Logs, Layers, Puzzle, Cpu, Plus, FolderKanban, FolderGit2, Workflow } from "lucide-react";
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
    title: "Platforms",
    icon: Cpu,
    items: [
      { title: "Platforms", url: "/platforms", icon: Layers, featurePrefix: "platform:" },
      { title: "Extensions", url: "/platforms/extensions", icon: Puzzle, featurePrefix: "platform_extension:" },
    ]
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

export function GlobalSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const hasAnyPermission = useAuthStore(state => state.hasAnyPermission);
  const { data: projectsData } = useProjects({ pageSize: 10, page: 1 });

  const handleNav = (url: string) => {
    startTransition(() => {
      navigate({ to: url });
    });
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border/40 pb-3">
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-sm">
            <Workflow className="size-4" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="truncate text-sm font-semibold tracking-tight text-sidebar-foreground">
              Automation Studio
            </span>
            <span className="truncate text-[10px] uppercase font-mono tracking-wider text-muted-foreground">
              Pipeline Engine
            </span>
          </div>
        </div>
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
                <SidebarMenuButton isActive={pathname === "/projects"} onPress={() => handleNav("/projects")}>
                  <FolderKanban className="size-4" />
                  <span>All Projects</span>
                </SidebarMenuButton>
                {projectsData?.items && projectsData.items.length > 0 && (
                  <SidebarMenuSub className="my-1 mr-0 ml-3.5 px-1.5 border-l border-border/50">
                    {projectsData.items.map((project) => (
                      <SidebarMenuSubItem key={project.id}>
                        <SidebarMenuSubButton
                          isActive={pathname.startsWith(`/projects/${project.id}`)}
                          onPress={() => handleNav(`/projects/${project.id}/overview`)}
                        >
                          <FolderGit2 className="size-3.5 text-muted-foreground" />
                          <span className="truncate">{project.name}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
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
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        isActive={pathname === item.url}
                        onPress={() => handleNav(item.url)}
                      >
                        <Icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
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
