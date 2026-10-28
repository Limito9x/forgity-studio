import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { AppBreadcrumb } from './AppBreadcrumb'
import { ThemeToggle } from '@/components/custom-ui/theme/ThemeToggle'
import { SupportDialog } from '@/components/custom-ui/support/SupportDialog'
import { Link } from '@tanstack/react-router'
import forgityLogo from '@/assets/forgity.svg'
import { appConfig } from '@/config/appConfig'

interface AppHeaderProps {
  showSidebarTrigger?: boolean;
}

export function AppHeader({ showSidebarTrigger = true }: AppHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 bg-background">
      <div className="flex items-center gap-2.5 px-2">
        <Link to="/" className="flex items-center gap-2 mr-1 transition-opacity hover:opacity-85" title={appConfig.name}>
          <div className="flex size-7 items-center justify-center rounded-lg border border-border/60 bg-card p-0.5 shadow-2xs overflow-hidden">
            <img src={forgityLogo} alt={appConfig.shortName} className="size-full object-contain rounded-xs" />
          </div>
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
        <SupportDialog />
        <ThemeToggle />
      </div>
    </header>
  )
}
