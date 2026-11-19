import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Laptop,
  Building2,
  Shield,
  Sparkles,
  ArrowLeftRight,
  Workflow,
  Cpu,
  LayoutDashboard,
  FolderKanban,
  HardDrive,
  Users,
  ShieldCheck,
  ScrollText,
  Settings,
  Library,
  LayoutGrid,
  ChevronDown,
  PackagePlus,
  FolderGit2,
  Plus,
  MoreHorizontal,
  FolderOpen,
  Trash2,
  Copy,
} from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useAppModeStore } from "@/stores/appModeStore";
import { useCurrentStudio } from "@/features/studios/hooks/useCurrentStudio";
import {
  resolveZoneFromPathname,
  useHasAnyAdminPermission,
  type AppZone,
} from "@/lib/navigation/zones";
import { NavUser } from "./NavUser";
import { StudioSwitcherDialog } from "./StudioSwitcherDialog";
import { useWorkspaceRegistry } from "@/features/pipelines/hooks/workspace/useWorkspaceRegistry";
import { openNativeFileOrFolderDialog, isTauriRuntime } from "@/lib/platform/filePickerStrategy";
import { toast } from "sonner";

export function UnifiedSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeZone = resolveZoneFromPathname(pathname);

  const accessToken = useAuthStore((s) => s.accessToken);
  const hasAnyPermission = useAuthStore((s) => s.hasAnyPermission);
  const hasAdmin = useHasAnyAdminPermission();
  const setMode = useAppModeStore((s) => s.setMode);

  const { studioSlug, studioName } = useCurrentStudio({
    enabled: Boolean(accessToken),
  });

  const [isStudioDialogOpen, setIsStudioDialogOpen] = useState(false);
  const [isZoneOpen, setIsZoneOpen] = useState(true);

  const goToZone = (zone: AppZone) => {
    if (zone === "local") {
      setMode("local");
      navigate({ to: "/local" as any });
      return;
    }

    setMode("cloud");
    if (!accessToken) {
      const target =
        zone === "templates"
          ? "/templates"
          : zone === "admin"
            ? "/admin"
            : "/studio";
      navigate({
        to: "/auth/login" as any,
        search: { redirect: target } as any,
      });
      return;
    }

    if (zone === "templates") {
      navigate({ to: "/templates" as any });
    } else if (zone === "admin") {
      navigate({ to: "/admin" as any });
    } else {
      if (studioSlug) {
        navigate({
          to: "/studio/$studioSlug" as any,
          params: { studioSlug } as any,
        });
      } else {
        navigate({ to: "/" as any });
      }
    }
  };

  const studioBase = studioSlug ? `/studio/${studioSlug}` : "/studio";

  const localItems = [
    {
      title: "Pipelines",
      url: "/local",
      icon: Workflow,
      isActive: pathname === "/local" || pathname === "/local/",
    },
    {
      title: "My Machine",
      url: "/local/machine",
      icon: Cpu,
      isActive: pathname.startsWith("/local/machine"),
    },
  ];

  const studioItems = [
    {
      title: "Dashboard",
      url: studioBase,
      icon: LayoutDashboard,
      isActive: pathname === studioBase || pathname === `${studioBase}/`,
    },
    {
      title: "Projects",
      url: `${studioBase}/projects`,
      icon: FolderKanban,
      isActive: pathname.startsWith(`${studioBase}/projects`),
    },
    {
      title: "Runners",
      url: `${studioBase}/runners`,
      icon: Cpu,
      isActive: pathname.startsWith(`${studioBase}/runners`),
    },
    {
      title: "Storage",
      url: `${studioBase}/storage`,
      icon: HardDrive,
      isActive: pathname.startsWith(`${studioBase}/storage`),
    },
  ];

  const adminItems = [
    {
      title: "Studios",
      url: "/admin/studios",
      icon: Building2,
      visible: hasAnyPermission("studios:"),
      isActive: pathname.startsWith("/admin/studios"),
    },
    {
      title: "Users",
      url: "/admin/users",
      icon: Users,
      visible: hasAnyPermission("users:"),
      isActive: pathname.startsWith("/admin/users"),
    },
    {
      title: "Roles",
      url: "/admin/roles",
      icon: ShieldCheck,
      visible: hasAnyPermission("roles:"),
      isActive: pathname.startsWith("/admin/roles"),
    },
    {
      title: "Audit Logs",
      url: "/admin/audit-logs",
      icon: ScrollText,
      visible: hasAnyPermission("auditlogs:"),
      isActive: pathname.startsWith("/admin/audit-logs"),
    },
    {
      title: "System Settings",
      url: "/admin/settings",
      icon: Settings,
      visible: hasAnyPermission("systemsettings:"),
      isActive: pathname.startsWith("/admin/settings"),
    },
    {
      title: "Templates Admin",
      url: "/admin/templates",
      icon: PackagePlus,
      visible: hasAnyPermission("templates:") || hasAnyPermission("studios:"),
      isActive: pathname.startsWith("/admin/templates"),
    },
  ].filter((item) => item.visible);

  const templateItems = [
    {
      title: "Templates",
      url: "/templates",
      icon: LayoutGrid,
      isActive:
        pathname === "/templates" ||
        (pathname.startsWith("/templates/") &&
          !pathname.startsWith("/templates/library")),
    },
    {
      title: "My Library",
      url: "/templates/library",
      icon: Library,
      isActive: pathname.startsWith("/templates/library"),
    },
  ];

  const {
    workspaces,
    registerWorkspace,
    removeWorkspace,
    revealInExplorer,
  } = useWorkspaceRegistry();

  const handleOpenNewWorkspace = async () => {
    if (!isTauriRuntime()) {
      navigate({ to: "/workspaces" as any });
      return;
    }

    try {
      const selected = await openNativeFileOrFolderDialog({
        mode: "folder",
        title: "Open Workspace Folder",
      });
      if (!selected) return;

      const folderName = selected.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "Local Workspace";
      const registered = await registerWorkspace({
        name: folderName,
        rootPath: selected,
      });

      toast.success(`Opened workspace "${registered.name}"`);
      navigate({
        to: "/workspaces/$workspaceId" as any,
        params: { workspaceId: registered.id } as any,
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to open workspace folder");
    }
  };

  const handleCopyPath = (path: string) => {
    navigator.clipboard.writeText(path);
    toast.success("Copied workspace path to clipboard");
  };

  const currentItems =
    activeZone === "local"
      ? localItems
      : activeZone === "templates"
        ? templateItems
        : activeZone === "admin"
          ? adminItems
          : studioItems;

  const zoneLabel =
    activeZone === "local"
      ? "Workspace"
      : activeZone === "templates"
        ? "Templates & Library"
        : activeZone === "admin"
          ? "Administration"
          : studioName || "Studio";

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className="gap-2">
          {/* Collapsible Zone Switcher: Local, Studio (+ Switch), Admin, Templates */}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-1 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent">
            <button
              type="button"
              onClick={() => setIsZoneOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group-data-[collapsible=icon]:hidden"
            >
              <span>Zone: {activeZone === "local" ? "workspace" : activeZone}</span>
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform duration-150",
                  !isZoneOpen && "-rotate-90"
                )}
              />
            </button>

            {isZoneOpen && (
              <SidebarMenu className="mt-1 space-y-0.5">
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Workspace"
                    isActive={activeZone === "local"}
                    onPress={() => goToZone("local")}
                    className={cn(
                      "h-8 text-xs font-medium",
                      activeZone === "local" &&
                      "bg-background text-foreground shadow-xs"
                    )}
                  >
                    <Laptop className="size-4" />
                    <span>Workspace</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {/* Solo-First: Studio zone temporarily hidden to focus on Local + Templates */}
                {false && (
                  <SidebarMenuItem className="relative flex items-center">
                    <SidebarMenuButton
                      tooltip="Studio"
                      isActive={activeZone === "studio"}
                      onPress={() => goToZone("studio")}
                      className={cn(
                        "h-8 text-xs font-medium pr-8",
                        activeZone === "studio" &&
                        "bg-background text-foreground shadow-xs"
                      )}
                    >
                      <Building2 className="size-4" />
                      <span className="truncate">Studio</span>
                    </SidebarMenuButton>
                    {accessToken && (
                      <button
                        type="button"
                        title="Switch Studio"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsStudioDialogOpen(true);
                        }}
                        className="absolute right-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors group-data-[collapsible=icon]:hidden"
                      >
                        <ArrowLeftRight className="size-3.5" />
                      </button>
                    )}
                  </SidebarMenuItem>
                )}

                {accessToken && hasAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      tooltip="Admin"
                      isActive={activeZone === "admin"}
                      onPress={() => goToZone("admin")}
                      className={cn(
                        "h-8 text-xs font-medium",
                        activeZone === "admin" &&
                        "bg-background text-foreground shadow-xs"
                      )}
                    >
                      <Shield className="size-4" />
                      <span>Admin</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Templates"
                    isActive={activeZone === "templates"}
                    onPress={() => goToZone("templates")}
                    className={cn(
                      "h-8 text-xs font-medium",
                      activeZone === "templates" &&
                      "bg-background text-foreground shadow-xs"
                    )}
                  >
                    <Sparkles className="size-4" />
                    <span>Templates</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
          {activeZone === "local" ? (
            <>
              {/* AI-Chat style Workspaces list with + action */}
              <SidebarGroup>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <SidebarGroupLabel className="p-0 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Workspaces
                  </SidebarGroupLabel>
                  <button
                    type="button"
                    onClick={handleOpenNewWorkspace}
                    title="Open or Create Workspace"
                    className="flex h-5 w-5 items-center justify-center rounded hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-muted-foreground transition-colors"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <SidebarGroupContent>
                  <SidebarMenu className="space-y-0.5">
                    {workspaces.length === 0 ? (
                      <div className="px-3 py-3 text-center">
                        <p className="text-xs text-muted-foreground">No local workspaces yet.</p>
                        <button
                          type="button"
                          onClick={handleOpenNewWorkspace}
                          className="mt-1.5 text-xs text-primary hover:underline font-medium inline-flex items-center gap-1"
                        >
                          <Plus className="size-3" />
                          <span>Open folder</span>
                        </button>
                      </div>
                    ) : (
                      workspaces.map((ws) => {
                        const isCurrent =
                          pathname === `/workspaces/${ws.id}` ||
                          (pathname === "/local" && ws.linkedProjectId === "local-default");
                        const isForked = Boolean(ws.originTemplateId);

                        return (
                          <SidebarMenuItem key={ws.id} className="group/item relative">
                            <SidebarMenuButton
                              tooltip={ws.name}
                              isActive={isCurrent}
                              onPress={() =>
                                navigate({
                                  to: "/workspaces/$workspaceId" as any,
                                  params: { workspaceId: ws.id } as any,
                                })
                              }
                              className="pr-7 text-xs"
                            >
                              {isForked ? (
                                <Sparkles className="size-3.5 text-amber-500 shrink-0" />
                              ) : (
                                <FolderGit2 className="size-3.5 text-blue-500 shrink-0" />
                              )}
                              <span className="truncate">{ws.name}</span>
                            </SidebarMenuButton>

                            {/* Dropdown Menu ... */}
                            <DropdownMenuTrigger>
                              <SidebarMenuAction
                                showOnHover
                                aria-label="Workspace Options"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </SidebarMenuAction>
                              <DropdownMenu placement="bottom end" className="w-44 text-xs">
                                <DropdownMenuItem onAction={() => revealInExplorer(ws.rootPath)}>
                                  <FolderOpen className="size-3.5 mr-2" />
                                  <span>Reveal in Explorer</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onAction={() => handleCopyPath(ws.rootPath)}>
                                  <Copy className="size-3.5 mr-2" />
                                  <span>Copy Path</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onAction={() => removeWorkspace(ws.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="size-3.5 mr-2" />
                                  <span>Remove from list</span>
                                </DropdownMenuItem>
                              </DropdownMenu>
                            </DropdownMenuTrigger>
                          </SidebarMenuItem>
                        );
                      })
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              {/* General Local Tools: My Machine, etc */}
              <SidebarGroup className="mt-2 border-t border-sidebar-border pt-2">
                <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Tools
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="All Workspaces"
                        isActive={pathname === "/workspaces"}
                        onPress={() => navigate({ to: "/workspaces" as any })}
                      >
                        <FolderKanban className="size-4" />
                        <span>Workspaces Directory</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        tooltip="My Machine"
                        isActive={pathname.startsWith("/local/machine")}
                        onPress={() => navigate({ to: "/local/machine" as any })}
                      >
                        <Cpu className="size-4" />
                        <span>My Machine</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          ) : (
            <SidebarGroup>
              <SidebarGroupLabel>{zoneLabel}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {currentItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={item.isActive}
                        onPress={() => navigate({ to: item.url as any })}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
      </Sidebar>

      <StudioSwitcherDialog
        open={isStudioDialogOpen}
        onOpenChange={setIsStudioDialogOpen}
      />
    </>
  );
}
