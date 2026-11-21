import { Cpu, Layers, Zap } from "lucide-react"

export function AuthBrandingPanel() {
  return (
    <div className="relative hidden md:flex flex-col justify-between p-8 bg-gradient-to-br from-sidebar-accent/80 via-background to-card border-l border-border/50 text-foreground overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute -top-24 -right-24 size-64 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 size-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 space-y-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-[11px] font-medium text-primary">
          <Zap className="size-3 text-amber-500 fill-amber-500/30" />
          Local-First 3D Automation
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground leading-snug">
          Craft your 3D workflow once.<br />Automate forever.
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
          Build visual pipelines connecting Blender, Unreal Engine 5, DAZ, and Python — or run ready-made Cloud Templates directly on your machine.
        </p>
      </div>

      <div className="relative z-10 space-y-3 pt-8">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 backdrop-blur-xs border border-border/60 shadow-2xs">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <Cpu className="size-4" />
          </div>
          <div className="text-xs min-w-0">
            <p className="font-medium text-foreground">100% Local Execution</p>
            <p className="text-muted-foreground text-[11px] truncate">Your 3D assets &amp; project files never leave your machine</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl bg-card/60 backdrop-blur-xs border border-border/60 shadow-2xs">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
            <Layers className="size-4" />
          </div>
          <div className="text-xs min-w-0">
            <p className="font-medium text-foreground">Cloud Template Library</p>
            <p className="text-muted-foreground text-[11px] truncate">Pull verified automation pipelines &amp; track run quotas</p>
          </div>
        </div>
      </div>

      <div className="relative z-10 pt-4 flex items-center justify-between text-[11px] text-muted-foreground/80 border-t border-border/40">
        <span>Forgity Studio</span>
        <span>Desktop Edition</span>
      </div>
    </div>
  )
}
