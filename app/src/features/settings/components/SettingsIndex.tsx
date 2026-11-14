import { Settings } from 'lucide-react'

export function SettingsIndex() {
  return (
    <div className="hidden md:flex h-full min-h-[400px] flex-col items-center justify-center space-y-4 text-muted-foreground border-2 border-dashed rounded-xl">
      <div className="rounded-full bg-muted p-4">
        <Settings className="h-8 w-8" />
      </div>
      <p className="text-lg font-medium">Select a setting from the sidebar</p>
    </div>
  )
}
