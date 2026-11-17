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
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
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
      ? "Local Workspace"
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
              <span>Zone: {activeZone}</span>
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
                    tooltip="Local"
                    isActive={activeZone === "local"}
                    onPress={() => goToZone("local")}
                    className={cn(
                      "h-8 text-xs font-medium",
                      activeZone === "local" &&
                        "bg-background text-foreground shadow-xs"
                    )}
                  >
                    <Laptop className="size-4" />
                    <span>Local</span>
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
