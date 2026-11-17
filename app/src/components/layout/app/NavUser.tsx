import { ChevronsUpDown, LogIn, LogOut, Settings, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/authStore";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useLogout } from "@/gen/endpoints/auth/auth";

export function NavUser() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const logoutMutation = useLogout();
  const accessToken = useAuthStore((s) => s.accessToken);
  const profile = useAuthStore((s) => s.profile);

  const handleSignIn = () => {
    navigate({ to: "/auth/login" as any });
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync(undefined);
    } catch {
      // Bỏ qua lỗi mạng backend nếu có, ưu tiên dọn sạch client
    } finally {
      useAuthStore.getState().logout();
      localStorage.removeItem("automation_current_studio_slug");
      localStorage.removeItem("automation_current_studio_id");
      queryClient.clear();
      window.location.href = "/auth/login";
    }
  };

  if (!accessToken || !profile) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            onPress={handleSignIn}
            className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarFallback className="rounded-lg bg-muted text-muted-foreground">
                <User className="size-4" />
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">Guest</span>
              <span className="truncate text-xs text-muted-foreground">
                Local Mode
              </span>
            </div>
            <LogIn className="ml-auto size-4 text-muted-foreground" />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const displayName =
    profile?.firstName || profile?.lastName
      ? `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim()
      : profile?.userName || profile?.email || "User";

  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenuTrigger>
          <SidebarMenuButton
            size="lg"
            className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer"
          >
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage src={undefined} alt={displayName} />
              <AvatarFallback className="rounded-lg font-semibold">
                {initials || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{displayName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {profile?.email || ""}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>

          <DropdownMenu placement="top start" offset={8} className="w-56">
            <DropdownMenuItem
              onAction={() => navigate({ to: "/account/settings/profile" as any })}
              className="gap-2 cursor-pointer"
            >
              <Settings className="size-4" />
              <span>Account Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onAction={handleLogout}
              variant="destructive"
              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenu>
        </DropdownMenuTrigger>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
