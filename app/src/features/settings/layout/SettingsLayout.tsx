import { Outlet, useRouterState } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { SettingsSidebar } from './SettingsSidebar';

export function SettingsLayout() {
  const routerState = useRouterState();
  const isIndex =
    routerState.location.pathname === '/account/settings' ||
    routerState.location.pathname === '/account/settings/';

  return (
    <div className="page-container p-6 md:p-8 max-w-6xl mx-auto w-full">
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
