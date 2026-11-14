import React from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { MobileNavigationClose } from "./AppShell";
import { AppHeader } from "./AppHeader";
import { LocalSidebar } from "./LocalSidebar";

export function LocalShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <MobileNavigationClose />
      <LocalSidebar />
      <SidebarInset className="flex flex-col h-full">
        <AppHeader showSidebarTrigger={true} />
        <div className="flex-1 bg-muted/20 min-w-0 overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
