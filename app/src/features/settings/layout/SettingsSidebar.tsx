import { Link } from '@tanstack/react-router'
import { User, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

const settingsNavItems = [
  {
    title: 'Profile',
    href: '/settings/profile',
    icon: User,
  },
  {
    title: 'Security',
    href: '/settings/security',
    icon: Shield,
  },
]


interface SettingsSidebarProps {
  className?: string
}

export function SettingsSidebar({ className }: SettingsSidebarProps) {
  return (
    <aside className={cn("w-full md:w-64 flex-shrink-0 space-y-1", className)}>
      <div className="mb-4 md:mb-6">
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account settings and preferences.</p>
      </div>
      <nav className="flex flex-col space-y-1">
        {settingsNavItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="flex flex-row items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:bg-accent hover:text-accent-foreground text-muted-foreground"
            activeProps={{
              className: "bg-accent text-accent-foreground"
            }}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.title}</span>
          </Link>
        ))}
      </nav>
    </aside>
  )
}
