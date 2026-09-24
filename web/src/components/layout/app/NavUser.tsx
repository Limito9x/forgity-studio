import {
  ChevronsUpDown,
  LogOut,
  Settings,
  Plus,
  Check,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { useLogout } from "@/gen/endpoints/auth/auth";
import { useStudios } from "@/features/studios/hooks/useStudios";
import { useStudioStore } from "@/stores/studioStore";
import { useDialogStore } from "@/stores/dialogStore";

export function NavUser() {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const profile = useAuthStore((state) => state.profile);
  const { clearToken, clearProfile } = useAuthStore();
  const logout = useLogout();

  const { data: studios = [] } = useStudios();
  const { activeStudioId, setActiveStudioId } = useStudioStore();
  const openDialog = useDialogStore((s) => s.openDialog);

  const currentStudio = studios.find((s) => s.id === activeStudioId) || studios[0];

  const handleLogout = async () => {
    try {
      await logout.mutateAsync(undefined);
    } catch {
      // Ignore error on logout
    } finally {
      clearToken();
      clearProfile();
      window.location.href = "/auth/login";
    }
  };

  const displayName = profile?.displayName || profile?.userName || "User";
  const email = profile?.email || "";
  const avatarUrl = profile?.avatarUrl ?? undefined;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenuTrigger>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <Avatar className="h-8 w-8 rounded-lg shrink-0">
              <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
              <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
              <span className="truncate font-semibold">{displayName}</span>
              <span className="truncate text-xs text-muted-foreground flex items-center gap-1">
                <span className="truncate">{currentStudio ? currentStudio.name : "Select Studio"}</span>
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </SidebarMenuButton>

          <DropdownMenu
            className="w-(--trigger-width) min-w-64 max-h-[85vh] rounded-xl p-1.5 shadow-xl"
            placement={isMobile ? "bottom" : "top"}
            offset={6}
          >
            {/* User Profile Header */}
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2.5 px-2 py-2 text-left text-sm">
                <Avatar className="h-9 w-9 rounded-lg shrink-0">
                  <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                  <AvatarFallback className="rounded-lg">{initial}</AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
                  <span className="truncate font-semibold text-foreground">{displayName}</span>
                  <span className="truncate text-xs text-muted-foreground">{email}</span>
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator className="my-1" />

            {/* Studios Section */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Studios
              </DropdownMenuLabel>
              {studios.map((studio) => {
                const isSelected = studio.id === currentStudio?.id;
                return (
                  <DropdownMenuItem
                    key={studio.id}
                    id={studio.id}
                    textValue={studio.name}
                    onAction={() => setActiveStudioId(studio.id)}
                    className="flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-lg"
                  >
                    <div className="flex aspect-square size-6 items-center justify-center rounded-md bg-primary/10 text-primary text-xs font-bold shrink-0">
                      {studio.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate text-sm font-medium">{studio.name}</span>
                      {studio.slug && (
                        <span className="truncate text-[11px] text-muted-foreground">
                          @{studio.slug}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="ml-auto size-4 text-primary shrink-0" />}
                  </DropdownMenuItem>
                );
              })}

              <DropdownMenuItem
                id="create-studio-action"
                textValue="Create Studio"
                onAction={() => openDialog("create-studio")}
                className="flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-lg text-muted-foreground hover:text-foreground"
              >
                <div className="flex aspect-square size-6 items-center justify-center rounded-md border border-dashed border-border bg-background shrink-0">
                  <Plus className="size-3.5" />
                </div>
                <span className="text-sm font-medium">Create Studio...</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="my-1" />

            {/* Account & Settings Section */}
            <DropdownMenuGroup>
              <DropdownMenuItem
                id="account-settings-action"
                textValue="Account Settings"
                onAction={() => navigate({ to: "/settings" })}
                className="flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded-lg text-sm"
              >
                <Settings className="size-4 text-muted-foreground" />
                <span>Account Settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator className="my-1" />

            {/* Log out */}
            <DropdownMenuItem
              id="logout-action"
              textValue="Log out"
              onAction={handleLogout}
              className="flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded-lg text-sm text-destructive focus:text-destructive focus:bg-destructive/10"
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
