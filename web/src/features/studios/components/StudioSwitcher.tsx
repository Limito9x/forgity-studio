import { useEffect } from "react";
import {
  ChevronsUpDown,
  Plus,
  Check,
  Building2,
  Settings,
} from "lucide-react";
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
import { useStudios } from "../hooks/useStudios";
import { useStudioStore } from "@/stores/studioStore";
import { useDialogStore } from "@/stores/dialogStore";
import { useNavigate } from "@tanstack/react-router";

export function StudioSwitcher() {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const { data: studios = [], isLoading } = useStudios();
  const { activeStudioId, setActiveStudioId } = useStudioStore();
  const openDialog = useDialogStore((s) => s.openDialog);

  // Auto-select first studio if none is active or active is invalid
  useEffect(() => {
    if (studios.length > 0) {
      const exists = studios.some((s) => s.id === activeStudioId);
      if (!activeStudioId || !exists) {
        setActiveStudioId(studios[0].id);
      }
    }
  }, [studios, activeStudioId, setActiveStudioId]);

  const currentStudio = studios.find((s) => s.id === activeStudioId) || studios[0];

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenuTrigger>
          <SidebarMenuButton
            size="lg"
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-semibold">
              {currentStudio ? (
                <span>{currentStudio.name.charAt(0).toUpperCase()}</span>
              ) : (
                <Building2 className="size-4" />
              )}
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight min-w-0">
              <span className="truncate font-semibold">
                {currentStudio ? currentStudio.name : isLoading ? "Loading..." : "Select Studio"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {currentStudio?.slug ? `@${currentStudio.slug}` : "Studio Tenant"}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </SidebarMenuButton>

          <DropdownMenu
            placement={isMobile ? "bottom" : "right top"}
            className="w-64"
          >
            <DropdownMenuLabel>Studios</DropdownMenuLabel>
            <DropdownMenuGroup>
              {studios.map((studio) => {
                const isSelected = studio.id === currentStudio?.id;
                return (
                  <DropdownMenuItem
                    key={studio.id}
                    onAction={() => setActiveStudioId(studio.id)}
                    className="flex items-center gap-2 cursor-pointer py-2"
                  >
                    <div className="flex aspect-square size-6 items-center justify-center rounded bg-muted text-xs font-semibold shrink-0">
                      {studio.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="truncate text-sm font-medium">{studio.name}</span>
                      {studio.slug && (
                        <span className="truncate text-xs text-muted-foreground">
                          @{studio.slug}
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="ml-auto size-4 text-primary shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onAction={() => openDialog("create-studio")}
              className="flex items-center gap-2 cursor-pointer py-2"
            >
              <div className="flex aspect-square size-6 items-center justify-center rounded border border-dashed border-border bg-background shrink-0">
                <Plus className="size-3.5" />
              </div>
              <span className="text-sm font-medium">Create Studio</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onAction={() => navigate({ to: "/system/settings" })}
              className="flex items-center gap-2 cursor-pointer py-2 text-muted-foreground"
            >
              <div className="flex aspect-square size-6 items-center justify-center rounded shrink-0">
                <Settings className="size-3.5" />
              </div>
              <span className="text-sm">Studio Settings</span>
            </DropdownMenuItem>
          </DropdownMenu>
        </DropdownMenuTrigger>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
