import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { AppBreadcrumb } from './AppBreadcrumb'
import { ThemeToggle } from '@/components/custom-ui/theme/ThemeToggle'
import { Link } from '@tanstack/react-router'
import forgityLogo from '@/assets/forgity-nobg.svg'
import { appConfig } from '@/config/appConfig'

interface AppHeaderProps {
  showSidebarTrigger?: boolean;
}

export function AppHeader({ showSidebarTrigger = true }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 bg-background">
      <div className="flex items-center gap-2.5 px-2">
        <Link to="/workspaces" className="flex items-center gap-2 mr-1 transition-opacity hover:opacity-85" title={appConfig.name}>
          <img src={forgityLogo} alt={appConfig.shortName} className="size-6 object-contain" />
        </Link>

        {showSidebarTrigger && (
          <>
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 h-4" />
          </>
        )}
        <AppBreadcrumb />
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
      </div>
    </header>
  )
}
