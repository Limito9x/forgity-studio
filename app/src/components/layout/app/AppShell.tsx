import { SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar"
import { GlobalSidebar } from "./GlobalSidebar"
import { useLocation } from "@tanstack/react-router"
import { AppHeader } from "./AppHeader"

import React from "react"

export function MobileNavigationClose() {
  const { isMobile, setOpenMobile } = useSidebar()
  const location = useLocation()

  React.useEffect(() => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }, [location.pathname, isMobile, setOpenMobile])

  return null
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <MobileNavigationClose />
      <GlobalSidebar />
      <SidebarInset className="flex flex-col h-full">
        <AppHeader showSidebarTrigger={true} />
        <div className="flex-1 bg-muted/20 min-w-0 overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
