import { Outlet, useRouterState } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { SettingsSidebar } from './SettingsSidebar';

export function SettingsLayout() {
  const routerState = useRouterState();
  const isIndex = routerState.location.pathname === '/settings' || routerState.location.pathname === '/settings/';

  return (
    <div className="page-container">
      <div className="flex flex-col md:flex-row gap-8 lg:gap-10">
        {/* Sidebar - hidden on mobile IF not on index */}
        <SettingsSidebar className={!isIndex ? "hidden md:block" : ""} />

        {/* Main Content - hidden on mobile IF on index */}
        <main className={cn(
          "flex-1 min-w-0",
          isIndex && "hidden md:block"
        )}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
