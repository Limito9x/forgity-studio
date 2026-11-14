import { startTransition } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Cpu, Laptop, LogIn, Workflow } from "lucide-react";
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
import { useAuthStore } from "@/stores/authStore";
import { NavUser } from "./NavUser";

export function LocalSidebar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const accessToken = useAuthStore((s) => s.accessToken);

  const handleNav = (url: string) => {
    startTransition(() => {
      navigate({ to: url as any });
    });
  };

  const isWorkspaceActive = pathname === "/local" || pathname === "/local/";
  const isMachineActive = pathname.startsWith("/local/machine");

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/40 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Local Mode"
              onPress={() => handleNav("/local")}
              className="hover:bg-sidebar-accent/60"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500 border border-emerald-500/25 shrink-0">
                <Laptop className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">Local Mode</span>
                <span className="truncate text-xs text-muted-foreground">
                  Offline Runner
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Local Studio</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="Pipelines & Workspace"
                  isActive={isWorkspaceActive}
                  onPress={() => handleNav("/local")}
                >
                  <Workflow />
                  <span>Pipelines</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip="My Machine & DCC Config"
                  isActive={isMachineActive}
                  onPress={() => handleNav("/local/machine")}
                >
                  <Cpu />
                  <span>My Machine</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        {accessToken ? (
          <NavUser />
        ) : (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Sign in to Cloud Studio"
                onPress={() => handleNav("/auth/login")}
              >
                <LogIn className="size-4 text-muted-foreground" />
                <span>Sign in to Cloud</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
