import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { AppBreadcrumb } from './AppBreadcrumb'
import { ThemeToggle } from '@/components/custom-ui/theme/ThemeToggle'

interface AppHeaderProps {
  showSidebarTrigger?: boolean;
}

export function AppHeader({ showSidebarTrigger = true }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 bg-background">
      <div className="flex items-center gap-2 px-4">
        {showSidebarTrigger && (
          <>
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
          </>
        )}
        <AppBreadcrumb />
      </div>
      <div className="flex items-center gap-1.5">
        <ThemeToggle />
      </div>
    </header>
  )
}
